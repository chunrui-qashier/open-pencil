//! Agent Skills folders the chat reads from the user's other agents (`~/.agents/skills`,
//! `~/.claude/skills`). Skills there are often symlinks into a checkout elsewhere, which the
//! fs plugin's scope judges by their real path, so reading goes through these commands instead:
//! they read only `.agents/skills` and `.claude/skills` folders, only the folders in them that
//! hold a SKILL.md, and only files inside those.

use std::fs;
use std::path::{Component, Path, PathBuf};

const SKILL_FILE: &str = "SKILL.md";
/// The specification asks for a SKILL.md under 500 lines; this leaves room for long ones.
const MAX_SKILL_FILE_BYTES: u64 = 256 * 1024;
const MAX_FILE_BYTES: u64 = 1024 * 1024;
/// Bounds the listing of a skill that is a whole repository checkout.
const MAX_LISTED_FILES: usize = 200;
const MAX_DEPTH: usize = 4;

#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillFolder {
    /// The folder's name, which the specification makes the skill's name.
    name: String,
    /// The folder inside the root, before following symlinks.
    path: String,
    skill_file: String,
    /// Files besides SKILL.md, relative to the folder, with `/` separators.
    files: Vec<String>,
}

/// A folder agents install skills into: `skills` inside `.agents` or `.claude`.
fn is_skills_root(root: &Path) -> bool {
    let mut names = root
        .components()
        .rev()
        .map(|component| component.as_os_str());
    names.next().is_some_and(|name| name == "skills")
        && names
            .next()
            .is_some_and(|name| name == ".agents" || name == ".claude")
}

fn is_listed_name(name: &str) -> bool {
    !name.starts_with('.') && name != "node_modules"
}

fn read_bounded(path: &Path, limit: u64) -> Result<String, String> {
    let size = fs::metadata(path).map_err(|error| error.to_string())?.len();
    if size > limit {
        return Err(format!("The file is larger than {} KB.", limit / 1024));
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|_| "The file is not text.".to_owned())
}

fn list_files(dir: &Path, prefix: &str, depth: usize, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if files.len() >= MAX_LISTED_FILES {
            return;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !is_listed_name(&name) || (depth == 0 && name == SKILL_FILE) {
            continue;
        }
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        // `metadata` follows symlinks, as the agents that installed them do.
        let Ok(metadata) = fs::metadata(entry.path()) else {
            continue;
        };
        if metadata.is_dir() {
            if depth + 1 < MAX_DEPTH {
                list_files(&entry.path(), &relative, depth + 1, files);
            }
        } else if metadata.is_file() {
            files.push(relative);
        }
    }
}

/// The skills directly inside `root`, each a folder with a SKILL.md; empty without the root.
pub fn read_skill_folders(root: &Path) -> Vec<SkillFolder> {
    if !is_skills_root(root) {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut folders: Vec<SkillFolder> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_owned();
            if !is_listed_name(&name) {
                return None;
            }
            let dir = entry.path();
            let skill_file = read_bounded(&dir.join(SKILL_FILE), MAX_SKILL_FILE_BYTES).ok()?;
            let mut files = Vec::new();
            list_files(&dir, "", 0, &mut files);
            Some(SkillFolder {
                name,
                path: dir.to_string_lossy().into_owned(),
                skill_file,
                files,
            })
        })
        .collect();
    folders.sort_by(|a, b| a.name.cmp(&b.name));
    folders
}

/// A file inside a skill folder, by the relative path the listing gave it.
pub fn read_skill_folder_file(dir: &Path, path: &str) -> Result<String, String> {
    let relative = Path::new(path);
    let plain = relative.components().all(|component| {
        matches!(component, Component::Normal(name) if name.to_str().is_some_and(is_listed_name))
    });
    if path.is_empty() || !plain {
        return Err(format!("\"{path}\" is not a file in the skill."));
    }
    if !dir.parent().is_some_and(is_skills_root) || !dir.join(SKILL_FILE).is_file() {
        return Err("The folder is not a skill.".to_owned());
    }
    let canonical_dir = dir.canonicalize().map_err(|error| error.to_string())?;
    let target = canonical_dir
        .join(relative)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    // A symlink inside the skill must not lead out of it.
    if !target.starts_with(&canonical_dir) {
        return Err(format!("\"{path}\" is not a file in the skill."));
    }
    read_bounded(&target, MAX_FILE_BYTES)
}

/// The skills folders a document's folder sees, nearest first: `.agents/skills` and
/// `.claude/skills` in it and each folder above, up to the repository root (the folder with
/// `.git`). The walk stops below `home`, whose own folders are read as the user's skills, and
/// at the file system's root.
pub fn project_skill_roots(dir: &Path, home: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if !dir.is_absolute() {
        return roots;
    }
    for folder in dir.ancestors() {
        if home.is_some_and(|home| folder == home) || folder.parent().is_none() {
            break;
        }
        for agent in [".agents", ".claude"] {
            let root = folder.join(agent).join("skills");
            if root.is_dir() {
                roots.push(root);
            }
        }
        if folder.join(".git").exists() {
            break;
        }
    }
    roots
}

#[tauri::command]
pub async fn project_skill_folders(dir: PathBuf) -> Result<Vec<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        project_skill_roots(&dir, std::env::home_dir().as_deref())
    })
    .await
    .map_err(|_| "Could not look for skills folders.".to_owned())
}

#[tauri::command]
pub async fn skill_folders(root: PathBuf) -> Result<Vec<SkillFolder>, String> {
    tauri::async_runtime::spawn_blocking(move || read_skill_folders(&root))
        .await
        .map_err(|_| "Could not read the skills folder.".to_owned())
}

#[tauri::command]
pub async fn skill_folder_file(dir: PathBuf, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_skill_folder_file(&dir, &path))
        .await
        .map_err(|_| "Could not read the skill file.".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let id = NEXT.fetch_add(1, Ordering::Relaxed);
            let base =
                std::env::temp_dir().join(format!("openpencil-skills-{}-{id}", std::process::id()));
            let _ = fs::remove_dir_all(&base);
            let dir = base.join(".agents").join("skills");
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn write(&self, path: &str, text: &str) {
            let path = self.0.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = self
                .0
                .parent()
                .and_then(Path::parent)
                .map(fs::remove_dir_all);
        }
    }

    #[test]
    fn lists_folders_with_a_skill_file_and_their_other_files() {
        let root = Scratch::new();
        root.write("grid/SKILL.md", "---\nname: grid\n---\n");
        root.write("grid/references/spacing.md", "8");
        root.write("grid/.hidden", "");
        root.write("grid/node_modules/x/index.js", "");
        root.write("notes/README.md", "not a skill");
        root.write(".cache/SKILL.md", "hidden");

        let folders = read_skill_folders(&root.0);
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "grid");
        assert_eq!(folders[0].skill_file, "---\nname: grid\n---\n");
        assert_eq!(folders[0].files, vec!["references/spacing.md"]);
    }

    #[test]
    fn a_missing_root_has_no_skills() {
        assert!(read_skill_folders(Path::new("/nonexistent/.agents/skills")).is_empty());
    }

    #[test]
    fn reads_only_skills_folders() {
        let root = Scratch::new();
        root.write("grid/SKILL.md", "---\nname: grid\n---\n");
        root.write("grid/notes.md", "8");
        let other = root.0.parent().unwrap().join("other");
        fs::create_dir_all(other.join("grid")).unwrap();
        fs::write(other.join("grid/SKILL.md"), "").unwrap();
        fs::write(other.join("grid/notes.md"), "").unwrap();

        assert!(read_skill_folders(&other).is_empty());
        assert!(read_skill_folder_file(&other.join("grid"), "notes.md").is_err());
        assert_eq!(read_skill_folders(&root.0).len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn follows_a_symlinked_skill() {
        let root = Scratch::new();
        let checkout = Scratch::new();
        checkout.write("SKILL.md", "---\nname: linked\n---\n");
        std::os::unix::fs::symlink(&checkout.0, root.0.join("linked")).unwrap();
        let folders = read_skill_folders(&root.0);
        assert_eq!(
            folders.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(),
            vec!["linked"]
        );
    }

    #[test]
    fn reads_only_files_inside_the_skill() {
        let root = Scratch::new();
        root.write("grid/SKILL.md", "");
        root.write("grid/references/spacing.md", "8");
        root.write("secret.txt", "no");
        let dir = root.0.join("grid");

        assert_eq!(
            read_skill_folder_file(&dir, "references/spacing.md"),
            Ok("8".to_owned())
        );
        assert!(read_skill_folder_file(&dir, "../secret.txt").is_err());
        assert!(read_skill_folder_file(&dir, "/etc/hosts").is_err());
        assert!(read_skill_folder_file(&dir, ".hidden").is_err());
        assert!(read_skill_folder_file(&root.0, "secret.txt").is_err());
    }

    #[test]
    fn finds_skills_folders_up_to_the_repository_root() {
        let scratch = Scratch::new();
        let base = scratch.0.parent().unwrap().parent().unwrap().to_path_buf();
        let repo = base.join("repo");
        let docs = repo.join("design").join("docs");
        fs::create_dir_all(&docs).unwrap();
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::create_dir_all(repo.join(".claude/skills")).unwrap();
        fs::create_dir_all(repo.join("design/.agents/skills")).unwrap();

        assert_eq!(
            project_skill_roots(&docs, None),
            vec![
                repo.join("design/.agents/skills"),
                repo.join(".claude/skills")
            ]
        );
        // The walk stops at the repository: `base` has a skills folder from `Scratch`.
        assert!(!project_skill_roots(&docs, None).contains(&scratch.0));
        // Home's own folders are the user's skills, not the document's.
        assert_eq!(
            project_skill_roots(&docs, Some(&repo.join("design"))),
            Vec::<PathBuf>::new()
        );
        assert!(project_skill_roots(Path::new("relative/dir"), None).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_cannot_lead_out_of_the_skill() {
        let root = Scratch::new();
        root.write("grid/SKILL.md", "");
        root.write("secret.txt", "no");
        let dir = root.0.join("grid");
        std::os::unix::fs::symlink(root.0.join("secret.txt"), dir.join("escape.md")).unwrap();
        assert!(read_skill_folder_file(&dir, "escape.md").is_err());
    }
}
