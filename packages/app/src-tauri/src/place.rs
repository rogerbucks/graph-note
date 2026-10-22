// Where a command may reach: only inside the picked folder (spec §41, standalone_app). Each path is checked twice:
// - by its words: relative, `/`-separated, no `..`, no root, no hidden part such as `.git`;
// - on disk: the nearest part that exists, links followed, must still be inside the folder's real path.
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

/// The path inside `root`, or why it may not be reached. `""` is `root` itself.
pub fn inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    let refused = || format!("not a path inside the folder: {path:?}");
    if path.contains('\\') || path.contains('\0') {
        return Err(refused());
    }
    let mut full = root.to_path_buf();
    for part in Path::new(path).components() {
        match part {
            Component::Normal(name) if !name.to_string_lossy().starts_with('.') => full.push(name),
            _ => return Err(refused()),
        }
    }
    // the nearest part that is there, its links followed, is still inside
    let mut there = full.as_path();
    while !there.exists() {
        there = there.parent().ok_or_else(refused)?;
    }
    let real = there.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root) {
        return Err(refused());
    }
    Ok(full)
}

/// Node's word for no such file, which the core reads as "no note there".
fn said(e: std::io::Error) -> String {
    if e.kind() == ErrorKind::NotFound {
        "ENOENT".to_string()
    } else {
        e.to_string()
    }
}

pub fn read_dir(root: &Path, path: &str) -> Result<Vec<(String, bool)>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(inside(root, path)?).map_err(said)? {
        let entry = entry.map_err(said)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // a link is followed for its kind; one that leads nowhere is left out
        let Ok(meta) = fs::metadata(entry.path()) else {
            continue;
        };
        entries.push((name, meta.is_dir()));
    }
    Ok(entries)
}

pub fn read_text(root: &Path, path: &str) -> Result<String, String> {
    let file = inside(root, path)?;
    let bytes = fs::read(&file).map_err(said)?;
    String::from_utf8(bytes).map_err(|_| format!("not UTF-8 text: {path:?}"))
}

pub fn write_text(root: &Path, path: &str, text: &str) -> Result<(), String> {
    let file = inside(root, path)?;
    let parent = file.parent().ok_or("a note needs a folder")?;
    let name = file
        .file_name()
        .ok_or("a note needs a name")?
        .to_string_lossy();
    let temp = parent.join(format!(".{name}.thoughtknot-{}", std::process::id()));
    let written = (|| {
        let mut out = fs::File::create(&temp)?;
        out.write_all(text.as_bytes())?;
        out.sync_all()?;
        fs::rename(&temp, &file)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map_err(said)
}

pub fn remove_file(root: &Path, path: &str) -> Result<(), String> {
    fs::remove_file(inside(root, path)?).map_err(said)
}

pub fn make_dir(root: &Path, path: &str) -> Result<(), String> {
    let folder = inside(root, path)?;
    fs::create_dir_all(&folder).map_err(said)?;
    // made, then checked again on disk: a link raced in while it was made is refused
    inside(root, path).map(|_| ())
}

/// The endings an export has: the images, the data, and a companion note.
const ENDINGS: [&str; 6] = ["svg", "png", "gql", "csv", "graphml", "md"];

/// Whether `name` is a file name an export may have: a name alone, never a path, with an export's ending.
fn export_name(name: &str) -> bool {
    let ending = name
        .rsplit_once('.')
        .map(|(stem, end)| !stem.is_empty() && ENDINGS.contains(&end));
    name.len() <= 240
        && ending == Some(true)
        && !name.starts_with('.')
        && !name.ends_with(' ')
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
}

/// `name` with `n` before its ending: `plan.svg` is `plan-2.svg`.
fn numbered(name: &str, n: usize) -> String {
    match (n, name.rsplit_once('.')) {
        (1, _) | (_, None) => name.to_string(),
        (_, Some((stem, end))) => format!("{stem}-{n}.{end}"),
    }
}

/// Writes an export's files as new files in `folder`, made where missing: never over a file already there.
/// A name taken gives the next number, the same for every file. All of the files or none. Gives the names written.
pub fn write_new(
    root: &Path,
    folder: &str,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<String>, String> {
    if files.is_empty() {
        return Err("an export needs a file".to_string());
    }
    if let Some((bad, _)) = files.iter().find(|(name, _)| !export_name(name)) {
        return Err(format!("not a name an export may have: {bad:?}"));
    }
    make_dir(root, folder)?;
    let dir = inside(root, folder)?;
    for n in 1..=1000 {
        let names: Vec<String> = files.iter().map(|(name, _)| numbered(name, n)).collect();
        if names
            .iter()
            .any(|name| dir.join(name).symlink_metadata().is_ok())
        {
            continue;
        }
        let mut made: Vec<PathBuf> = Vec::new();
        let written = files.iter().zip(&names).try_for_each(|((_, bytes), name)| {
            let path = dir.join(name);
            let mut out = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?;
            made.push(path);
            out.write_all(bytes)?;
            out.sync_all()
        });
        match written {
            Ok(()) => return Ok(names),
            Err(e) => {
                for path in made {
                    let _ = fs::remove_file(path);
                }
                if e.kind() != ErrorKind::AlreadyExists {
                    return Err(said(e));
                }
            }
        }
    }
    Err("every name for this export is taken".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "thoughtknot-place-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn a_path_by_its_words_stays_inside() {
        let root = folder();
        for bad in [
            "../x.md",
            "a/../../x.md",
            "/etc/passwd",
            ".git/config",
            "a/.obsidian/x.md",
            "a\\b.md",
            "a\0.md",
        ] {
            assert!(inside(&root, bad).is_err(), "{bad} was let through");
        }
        assert_eq!(
            inside(&root, "a/b.md").unwrap(),
            root.join("a").join("b.md")
        );
        assert_eq!(inside(&root, "").unwrap(), root);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_out_of_the_folder_is_refused() {
        let root = folder();
        let outside = folder().with_extension("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("out")).unwrap();
        assert!(inside(&root, "out/x.md").is_err());
        assert!(write_text(&root, "out/x.md", "no").is_err());
        assert!(!outside.join("x.md").exists());
    }

    #[test]
    fn a_note_is_written_whole_and_read_back_byte_for_byte() {
        let root = folder();
        make_dir(&root, "a/b").unwrap();
        let text = "\u{feff}line\r\nünïcödé 漢字 😀  \n";
        write_text(&root, "a/b/n.md", text).unwrap();
        assert_eq!(read_text(&root, "a/b/n.md").unwrap(), text);
        assert_eq!(
            read_dir(&root, "a/b").unwrap(),
            vec![("n.md".to_string(), false)]
        );
        remove_file(&root, "a/b/n.md").unwrap();
        assert_eq!(read_text(&root, "a/b/n.md").unwrap_err(), "ENOENT");
    }

    #[test]
    fn an_export_is_written_as_new_files_and_never_over_one() {
        let root = folder();
        let files = vec![
            ("plan.svg".to_string(), b"<svg/>".to_vec()),
            ("plan.png".to_string(), vec![0x89, 0x50]),
        ];
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan.svg", "plan.png"]
        );
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan-2.svg", "plan-2.png"]
        );
        fs::write(root.join("Exports").join("plan-3.png"), "kept").unwrap();
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan-4.svg", "plan-4.png"]
        );
        assert_eq!(read_text(&root, "Exports/plan-3.png").unwrap(), "kept");
        assert!(!root.join("Exports").join("plan-3.svg").exists());
        for bad in [
            "a/b.svg", "../b.svg", ".b.svg", "b.exe", "b", "b.svg ", "a\\b.svg",
        ] {
            assert!(
                write_new(&root, "", &[(bad.to_string(), vec![])]).is_err(),
                "{bad} was let through"
            );
        }
        assert!(write_new(&root, "../out", &files).is_err());
    }
}
