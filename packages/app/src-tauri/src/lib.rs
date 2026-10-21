// The desktop app (spec §41, standalone_app): one window, and the notes of one folder the person picks. The window
// runs the browser editor's page, which reads and writes notes through the seven commands below and nothing else.
// - Nothing is fetched: the window's pages come from inside the app, and its policy allows no other origin.
// - Every path a command takes is relative to the picked folder. A path that climbs out (`..`), starts at a root, names
//   a hidden part (`.git`) or reaches outside through a link is refused before anything is read or written.
// - A note is written whole: to a new file beside it, then renamed over it. So a failed write leaves the note as it was.
// - An export is only ever new files: never written over a file already there.
mod place;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// The folder the person picked; none until they pick one.
#[derive(Default)]
struct Folder(Mutex<Option<PathBuf>>);

impl Folder {
    fn root(&self) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "the folder is unreadable".to_string())?
            .clone()
            .ok_or_else(|| "no folder is open".to_string())
    }
}

/// Asks the person for a folder of notes, with the system's own dialog. Its name, or none when they cancelled.
#[tauri::command]
async fn pick_folder(
    app: tauri::AppHandle,
    folder: State<'_, Folder>,
) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let real = path.canonicalize().map_err(|e| e.to_string())?;
    let name = real
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    *folder
        .0
        .lock()
        .map_err(|_| "the folder is unreadable".to_string())? = Some(real);
    Ok(Some(name))
}

/// Each entry of a folder inside the picked one: its name, and whether it is a folder. `""` is the picked folder.
#[tauri::command]
fn read_dir(path: String, folder: State<'_, Folder>) -> Result<Vec<(String, bool)>, String> {
    place::read_dir(&folder.root()?, &path)
}

/// A note's text. The error is `ENOENT` when there is no file.
#[tauri::command]
fn read_text(path: String, folder: State<'_, Folder>) -> Result<String, String> {
    place::read_text(&folder.root()?, &path)
}

/// Writes a note whole: a new file beside it, renamed over it.
#[tauri::command]
fn write_text(path: String, text: String, folder: State<'_, Folder>) -> Result<(), String> {
    place::write_text(&folder.root()?, &path, &text)
}

#[tauri::command]
fn remove_file(path: String, folder: State<'_, Folder>) -> Result<(), String> {
    place::remove_file(&folder.root()?, &path)
}

/// Makes a folder and the folders above it, inside the picked one.
#[tauri::command]
fn make_dir(path: String, folder: State<'_, Folder>) -> Result<(), String> {
    place::make_dir(&folder.root()?, &path)
}

/// Writes an export's files as new files in a folder inside the picked one. Gives the names written.
#[tauri::command]
fn write_new(
    into: String,
    files: Vec<(String, Vec<u8>)>,
    folder: State<'_, Folder>,
) -> Result<Vec<String>, String> {
    place::write_new(&folder.root()?, &into, &files)
}

/// The folder named as the first argument, such as `thoughtknot ~/Notes`, when it is one.
fn folder_named() -> Option<PathBuf> {
    let real = PathBuf::from(std::env::args_os().nth(1)?)
        .canonicalize()
        .ok()?;
    real.is_dir().then_some(real)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Folder(Mutex::new(folder_named())))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            read_dir,
            read_text,
            write_text,
            remove_file,
            make_dir,
            write_new
        ])
        .run(tauri::generate_context!())
        .expect("the app could not start");
}
