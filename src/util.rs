// On i686 on Windows, the CPython interpreter sets the FPU precision control
// flag to 53 bits of precision, rather than the 64 bit default. On x86_64 on
// Windows, the CPython interpreter changes the rounding control settings. This
// causes different floating point results than on other architectures. This
// context manager makes it easy to set the correct precision and rounding control
// to match our other targets and platforms.
//
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1623335 for additional context.
#[cfg(all(target_os = "windows", target_env = "gnu"))]
pub mod floating_point_context {
    // `size_t` is "pointer size", which is equivalent to Rust's `usize`.
    // It's defined as such in libc:
    // * https://github.com/rust-lang/libc/blob/bcbfeb5516cd5bb055198dbfbddf8d626fa2be07/src/unix/mod.rs#L19
    // * https://github.com/rust-lang/libc/blob/bcbfeb5516cd5bb055198dbfbddf8d626fa2be07/src/windows/mod.rs#L16
    #[allow(non_camel_case_types)]
    type size_t = usize;

    #[link(name = "m")]
    extern "C" {
        // Gets and sets the floating point control word.
        // See documentation here:
        // https://docs.microsoft.com/en-us/cpp/c-runtime-library/reference/controlfp-s
        fn _controlfp_s(current: *mut size_t, new: size_t, mask: size_t) -> size_t;
    }

    // Rounding control mask
    const MCW_RC: size_t = 0x00000300;
    // Round by truncation
    const RC_CHOP: size_t = 0x00000300;
    // Precision control mask
    const MCW_PC: size_t = 0x00030000;
    // Values for 64-bit precision
    const PC_64: size_t = 0x00000000;

    pub struct FloatingPointContext {
        original_value: size_t,
    }

    impl FloatingPointContext {
        pub fn new() -> Self {
            let mut current: size_t = 0;
            let _err = unsafe { _controlfp_s(&mut current, PC_64 | RC_CHOP, MCW_PC | MCW_RC) };

            FloatingPointContext {
                original_value: current,
            }
        }
    }

    impl Drop for FloatingPointContext {
        fn drop(&mut self) {
            let mut current: size_t = 0;
            let _err = unsafe { _controlfp_s(&mut current, self.original_value, MCW_PC | MCW_RC) };
        }
    }
}

#[cfg(not(all(target_os = "windows", target_env = "gnu")))]
pub mod floating_point_context {
    pub struct FloatingPointContext {}

    impl FloatingPointContext {
        pub fn new() -> Self {
            FloatingPointContext {}
        }
    }
}
