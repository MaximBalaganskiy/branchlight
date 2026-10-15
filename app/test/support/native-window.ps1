param(
  [int]$AppProcessId,
  [ValidateSet('main', 'commit')][string]$Window = 'main',
  [ValidateSet('inspect', 'resize', 'maximize', 'minimize', 'restore', 'close', 'gesture', 'resize-edge', 'snap-left')][string]$Action = 'inspect',
  [int]$X = 100,
  [int]$Y = 100,
  [int]$Width = 1600,
  [int]$Height = 1100,
  [int]$StartX = 0,
  [int]$StartY = 0,
  [int]$DeltaX = 0,
  [int]$DeltaY = 0
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
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
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
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
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

if ($Action -in @('gesture', 'resize-edge', 'snap-left')) {
  [void][NativeWindow]::SetForegroundWindow($script:targetWindow)
  Start-Sleep -Milliseconds 150
  if ([NativeWindow]::GetForegroundWindow() -ne $script:targetWindow) {
    throw 'Refusing to send input because the test window is not foreground.'
  }
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
  { $_ -in @('gesture', 'resize-edge') } {
    $origin = New-Object NativeWindow+Point
    if ($Action -eq 'resize-edge') {
      $edgeBounds = New-Object int[] 4
      [void][NativeWindow]::GetWindowRect($script:targetWindow, $edgeBounds)
      $origin.Y = [int](($edgeBounds[1] + $edgeBounds[3]) / 2)
      $edgePoints = @()
      for ($offset = 1; $offset -le 24; $offset++) {
        $origin.X = $edgeBounds[2] - $offset
        $pointValue = (($origin.Y -band 0xFFFF) -shl 16) -bor ($origin.X -band 0xFFFF)
        if ([NativeWindow]::SendMessage($script:targetWindow, 0x84, [IntPtr]::Zero, [IntPtr]$pointValue).ToInt64() -eq 11) {
          $edgePoints += $origin.X
        }
      }
      if (-not $edgePoints.Count) { throw 'No native right resize edge was found on the test window.' }
      $origin.X = $edgePoints[[int][Math]::Floor($edgePoints.Count / 2)]
    } else {
      $origin.X = $StartX
      $origin.Y = $StartY
      [void][NativeWindow]::ClientToScreen($script:targetWindow, [ref]$origin)
    }
    $hit = [NativeWindow]::WindowFromPoint($origin)
    if ([NativeWindow]::GetAncestor($hit, 2) -ne $script:targetWindow) {
      throw 'Refusing to drag outside the test application.'
    }
    $cursor = New-Object NativeWindow+Point
    [void][NativeWindow]::GetCursorPos([ref]$cursor)
    try {
      [void][NativeWindow]::SetCursorPos($origin.X, $origin.Y)
      Start-Sleep -Milliseconds 80
      [NativeWindow]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 150
      for ($step = 1; $step -le 12; $step++) {
        [void][NativeWindow]::SetCursorPos($origin.X + [int]($DeltaX * $step / 12), $origin.Y + [int]($DeltaY * $step / 12))
        Start-Sleep -Milliseconds 25
      }
    } finally {
      [NativeWindow]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
      # Let the native move/size loop consume button-up before restoring the cursor.
      Start-Sleep -Milliseconds 150
      [void][NativeWindow]::SetCursorPos($cursor.X, $cursor.Y)
    }
    Start-Sleep -Milliseconds 150
  }
  'snap-left' {
    try {
      [NativeWindow]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
      [NativeWindow]::keybd_event(0x25, 0, 0, [UIntPtr]::Zero)
    } finally {
      [NativeWindow]::keybd_event(0x25, 0, 2, [UIntPtr]::Zero)
      [NativeWindow]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 400
  }
  'close' {
    [void][NativeWindow]::PostMessage($script:targetWindow, 16, [IntPtr]::Zero, [IntPtr]::Zero)
    return
  }
}

$bounds = New-Object int[] 4
$client = New-Object int[] 4
[void][NativeWindow]::GetWindowRect($script:targetWindow, $bounds)
[void][NativeWindow]::GetClientRect($script:targetWindow, $client)
$clientOrigin = New-Object NativeWindow+Point
[void][NativeWindow]::ClientToScreen($script:targetWindow, [ref]$clientOrigin)
@{
  x = $bounds[0]
  y = $bounds[1]
  width = $client[2]
  height = $client[3]
  maximized = [NativeWindow]::IsZoomed($script:targetWindow)
  minimized = [NativeWindow]::IsIconic($script:targetWindow)
  frameTop = $clientOrigin.Y - $bounds[1]
} | ConvertTo-Json -Compress
