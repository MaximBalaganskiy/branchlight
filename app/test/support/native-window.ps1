param(
  [int]$AppProcessId,
  [ValidateSet('main', 'commit')][string]$Window = 'main',
  [ValidateSet('inspect', 'resize', 'maximize', 'minimize', 'restore', 'close')][string]$Action = 'inspect',
  [int]$X = 100,
  [int]$Y = 100,
  [int]$Width = 1600,
  [int]$Height = 1100
)

$ErrorActionPreference = 'Stop'
$appProcess = Get-Process -Id $AppProcessId
$expectedPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src-tauri/target/release/branchlight.exe'))
if ($appProcess.Path -ne $expectedPath) {
  throw 'Window tests may only control the test executable.'
}

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeWindow {
  public delegate bool Callback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, [Out] int[] rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, [Out] int[] rect);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@

[void][NativeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$script:targetWindow = [IntPtr]::Zero
[void][NativeWindow]::EnumWindows({
  param($handle, $data)
  $owner = [uint32]0
  [void][NativeWindow]::GetWindowThreadProcessId($handle, [ref]$owner)
  if ($owner -eq $AppProcessId) {
    $title = New-Object Text.StringBuilder 512
    [void][NativeWindow]::GetWindowText($handle, $title, 512)
    if ($title.Length -gt 0 -and $title.ToString().Contains('Branchlight') -and ($title.ToString().StartsWith('Commit') -eq ($Window -eq 'commit'))) {
      $script:targetWindow = $handle
      return $false
    }
  }
  return $true
}, [IntPtr]::Zero)
if ($script:targetWindow -eq [IntPtr]::Zero) {
  throw "No $Window test window found."
}

switch ($Action) {
  'resize' {
    [void][NativeWindow]::ShowWindow($script:targetWindow, 9)
    if (-not [NativeWindow]::SetWindowPos($script:targetWindow, [IntPtr]::Zero, $X, $Y, $Width, $Height, 4)) {
      throw 'Could not resize the test window.'
    }
  }
  'maximize' { [void][NativeWindow]::ShowWindow($script:targetWindow, 3) }
  'minimize' { [void][NativeWindow]::ShowWindow($script:targetWindow, 6) }
  'restore' { [void][NativeWindow]::ShowWindow($script:targetWindow, 9) }
  'close' {
    [void][NativeWindow]::PostMessage($script:targetWindow, 16, [IntPtr]::Zero, [IntPtr]::Zero)
    return
  }
}

$bounds = New-Object int[] 4
$client = New-Object int[] 4
[void][NativeWindow]::GetWindowRect($script:targetWindow, $bounds)
[void][NativeWindow]::GetClientRect($script:targetWindow, $client)
@{
  x = $bounds[0]
  y = $bounds[1]
  width = $client[2]
  height = $client[3]
  maximized = [NativeWindow]::IsZoomed($script:targetWindow)
  minimized = [NativeWindow]::IsIconic($script:targetWindow)
} | ConvertTo-Json -Compress
