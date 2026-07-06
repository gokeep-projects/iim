#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreenCaptureLaunchTarget {
    pub program: &'static str,
    pub args: Vec<&'static str>,
}

pub fn screen_capture_launch_target(os: &str) -> Option<ScreenCaptureLaunchTarget> {
    match os {
        "windows" => Some(ScreenCaptureLaunchTarget {
            program: "cmd",
            args: vec!["/C", "start", "", "ms-screenclip:"],
        }),
        _ => None,
    }
}

pub fn start_system_screen_capture() -> anyhow::Result<()> {
    let target = screen_capture_launch_target(std::env::consts::OS).ok_or_else(|| {
        anyhow::anyhow!("screen capture is only supported on Windows in this build")
    })?;

    std::process::Command::new(target.program)
        .args(target.args)
        .spawn()
        .map(|_| ())
        .map_err(Into::into)
}
