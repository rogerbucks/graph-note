// The app's commands, each allowed by name in capabilities/default.json and nowhere else (deny by default).
fn main() {
    let commands = &[
        "pick_folder",
        "read_dir",
        "read_text",
        "write_text",
        "remove_file",
        "make_dir",
        "write_new",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("the app's build steps failed");
}
