use std::sync::atomic::{AtomicBool, Ordering};

static FORCE_QUIT: AtomicBool = AtomicBool::new(false);

pub fn should_force_quit() -> bool {
    FORCE_QUIT.load(Ordering::SeqCst)
}

pub fn set_force_quit() {
    FORCE_QUIT.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_force_quit_skips_later_flush_check() {
        assert!(!should_force_quit());
        set_force_quit();
        assert!(should_force_quit());
    }
}
