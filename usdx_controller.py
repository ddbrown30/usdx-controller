from __future__ import annotations

import argparse
import ctypes
import time
from ctypes import wintypes

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

# ---------------------------------------------------------------------------
# Windows constants
# ---------------------------------------------------------------------------

VK_J = 0x4A
VK_RETURN = 0x0D

# Physical keyboard scan codes.
SC_J = 0x24
SC_RETURN = 0x1C

INPUT_KEYBOARD = 1

KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

ULONG_PTR = (
    ctypes.c_ulonglong
    if ctypes.sizeof(ctypes.c_void_p) == 8
    else ctypes.c_ulong
)


# ---------------------------------------------------------------------------
# Windows structures
# ---------------------------------------------------------------------------

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [
        ("type", wintypes.DWORD),
        ("u", INPUT_UNION),
    ]


# Explicitly declare the Windows API signature.
user32.SendInput.argtypes = [
    wintypes.UINT,
    ctypes.POINTER(INPUT),
    ctypes.c_int,
]

user32.SendInput.restype = wintypes.UINT


# ---------------------------------------------------------------------------
# Keyboard input
# ---------------------------------------------------------------------------

def send_input(input_data: INPUT) -> None:
    result = user32.SendInput(
        1,
        ctypes.byref(input_data),
        ctypes.sizeof(INPUT),
    )

    if result != 1:
        raise ctypes.WinError(ctypes.get_last_error())


def send_scan_code(scan_code: int, key_up: bool = False) -> None:
    """
    Send a physical-key-style keyboard event using a scan code.

    This is different from sending a virtual key or Unicode character.
    SDL applications such as USDX are more likely to process this as
    normal keyboard input.
    """

    flags = KEYEVENTF_SCANCODE

    if key_up:
        flags |= KEYEVENTF_KEYUP

    input_data = INPUT(
        type=INPUT_KEYBOARD,
        ki=KEYBDINPUT(
            wVk=0,
            wScan=scan_code,
            dwFlags=flags,
            time=0,
            dwExtraInfo=0,
        ),
    )

    send_input(input_data)


def press_scan_code(scan_code: int) -> None:
    send_scan_code(scan_code)
    send_scan_code(scan_code, key_up=True)


def send_key(vk: int, key_up: bool = False) -> None:
    """
    Send a virtual-key event.

    Kept for cases where a virtual-key event is specifically required.
    """

    flags = KEYEVENTF_KEYUP if key_up else 0

    input_data = INPUT(
        type=INPUT_KEYBOARD,
        ki=KEYBDINPUT(
            wVk=vk,
            wScan=0,
            dwFlags=flags,
            time=0,
            dwExtraInfo=0,
        ),
    )

    send_input(input_data)


def press_key(vk: int) -> None:
    send_key(vk)
    send_key(vk, key_up=True)


def type_text(text: str) -> None:
    """
    Type text using physical keyboard scan codes where possible.

    ASCII characters are converted to their keyboard scan codes using
    MapVirtualKeyW. Characters that cannot be represented by the current
    keyboard layout fall back to KEYEVENTF_UNICODE.
    """

    for char in text:
        codepoint = ord(char)

        # Get the virtual key corresponding to this character.
        vk = user32.VkKeyScanW(char)

        if vk == 0xFFFF:
            # No keyboard-layout mapping exists for this character.
            # Fall back to Unicode input.
            key_down = INPUT(
                type=INPUT_KEYBOARD,
                ki=KEYBDINPUT(
                    wVk=0,
                    wScan=codepoint,
                    dwFlags=KEYEVENTF_UNICODE,
                    time=0,
                    dwExtraInfo=0,
                ),
            )

            key_up = INPUT(
                type=INPUT_KEYBOARD,
                ki=KEYBDINPUT(
                    wVk=0,
                    wScan=codepoint,
                    dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time=0,
                    dwExtraInfo=0,
                ),
            )

            send_input(key_down)
            send_input(key_up)

            time.sleep(0.01)
            continue

        # Low byte = virtual key.
        vk_code = vk & 0xFF

        # High byte = required modifier keys.
        modifiers = (vk >> 8) & 0xFF

        # Convert virtual key to physical scan code.
        scan_code = user32.MapVirtualKeyW(
            vk_code,
            0,  # MAPVK_VK_TO_VSC
        )

        if not scan_code:
            # Should be rare, but fall back to Unicode if there is no
            # physical scan code.
            key_down = INPUT(
                type=INPUT_KEYBOARD,
                ki=KEYBDINPUT(
                    wVk=0,
                    wScan=codepoint,
                    dwFlags=KEYEVENTF_UNICODE,
                    time=0,
                    dwExtraInfo=0,
                ),
            )

            key_up = INPUT(
                type=INPUT_KEYBOARD,
                ki=KEYBDINPUT(
                    wVk=0,
                    wScan=codepoint,
                    dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time=0,
                    dwExtraInfo=0,
                ),
            )

            send_input(key_down)
            send_input(key_up)

            time.sleep(0.01)
            continue

        # Modifier bits returned by VkKeyScanW:
        #
        # 0x01 = SHIFT
        # 0x02 = CTRL
        # 0x04 = ALT
        #
        # Send modifiers before the character.
        if modifiers & 0x01:
            send_scan_code(0x2A)  # Left Shift

        if modifiers & 0x02:
            send_scan_code(0x1D)  # Left Ctrl

        if modifiers & 0x04:
            send_scan_code(0x38)  # Left Alt

        # Actual character.
        send_scan_code(scan_code)
        send_scan_code(scan_code, key_up=True)

        # Release modifiers in reverse order.
        if modifiers & 0x04:
            send_scan_code(0x38, key_up=True)

        if modifiers & 0x02:
            send_scan_code(0x1D, key_up=True)

        if modifiers & 0x01:
            send_scan_code(0x2A, key_up=True)

        time.sleep(0.01)


# ---------------------------------------------------------------------------
# USDX window detection
# ---------------------------------------------------------------------------

def get_process_name_from_window(hwnd: int) -> str | None:
    """Return the executable path associated with a window."""

    process_id = wintypes.DWORD()

    user32.GetWindowThreadProcessId(
        hwnd,
        ctypes.byref(process_id),
    )

    if not process_id.value:
        return None

    process_handle = kernel32.OpenProcess(
        PROCESS_QUERY_LIMITED_INFORMATION,
        False,
        process_id.value,
    )

    if not process_handle:
        return None

    try:
        buffer_size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(buffer_size.value)

        result = kernel32.QueryFullProcessImageNameW(
            process_handle,
            0,
            buffer,
            ctypes.byref(buffer_size),
        )

        if not result:
            return None

        return buffer.value

    finally:
        kernel32.CloseHandle(process_handle)


def find_usdx_window() -> int:
    """
    Find the actual USDX application window.

    We identify the executable rather than matching the window title, because
    the USDX launcher/console can have a similar title.
    """

    windows: list[tuple[int, str, str]] = []

    @ctypes.WINFUNCTYPE(
        wintypes.BOOL,
        wintypes.HWND,
        wintypes.LPARAM,
    )
    def enum_callback(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True

        exe_path = get_process_name_from_window(hwnd)

        if not exe_path:
            return True

        exe_name = exe_path.rsplit("\\", 1)[-1].lower()

        if exe_name != "ultrastardx.exe":
            return True

        length = user32.GetWindowTextLengthW(hwnd)

        if length:
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            title = buffer.value
        else:
            title = ""

        windows.append((hwnd, exe_path, title))

        return True

    user32.EnumWindows(enum_callback, 0)

    if not windows:
        raise RuntimeError(
            "Could not find the USDX application window.\n"
            "Make sure UltraStar Deluxe is running."
        )

    if len(windows) > 1:
        print("Found multiple USDX windows:")
        for hwnd, exe_path, title in windows:
            print(f"  HWND {hwnd}: {title!r} ({exe_path})")

    titled_windows = [
        window
        for window in windows
        if window[2].strip()
    ]

    if not titled_windows:
        raise RuntimeError(
            "Found ultrastardx.exe, but none of its windows have a title."
        )

    hwnd, exe_path, title = titled_windows[0]

    print(f"USDX executable: {exe_path}")
    print(f"USDX window: {hwnd}")
    print(f"USDX title: {title!r}")

    return hwnd


# ---------------------------------------------------------------------------
# Window activation
# ---------------------------------------------------------------------------

def focus_window(hwnd: int) -> None:
    """
    Bring USDX to the foreground.

    SetForegroundWindow can fail in some Windows focus situations, so we
    restore the window first if it is minimized.
    """

    SW_RESTORE = 9

    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
        time.sleep(0.1)

    if not user32.SetForegroundWindow(hwnd):
        raise ctypes.WinError(ctypes.get_last_error())

    time.sleep(0.25)


# ---------------------------------------------------------------------------
# USDX control
# ---------------------------------------------------------------------------

def play_song(search_text: str) -> None:
    hwnd = find_usdx_window()

    print(f"Search: {search_text}")

    focus_window(hwnd)

    print("Opening search...")
    press_scan_code(SC_J)
    time.sleep(0.5)

    print("Typing search...")
    type_text(search_text)
    time.sleep(0.25)

    print("Applying search...")
    press_scan_code(SC_RETURN)
    time.sleep(0.5)

    print("Starting song...")
    press_scan_code(SC_RETURN)

    print("Done.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Control UltraStar Deluxe song selection."
    )

    parser.add_argument(
        "search",
        nargs="+",
        help="Text to search for in USDX.",
    )

    args = parser.parse_args()

    play_song(" ".join(args.search))


if __name__ == "__main__":
    main()