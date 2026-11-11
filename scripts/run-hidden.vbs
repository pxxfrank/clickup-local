' ClickUp Local - hidden service launcher for Windows Task Scheduler.
' Usage: wscript.exe run-hidden.vbs [port]
Option Explicit

Dim fso, shell, scriptDir, appRoot, port, nodeExe, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appRoot = fso.GetParentFolderName(scriptDir)
port = "23090"
nodeExe = "node"
If WScript.Arguments.Count > 0 Then port = WScript.Arguments(0)
If WScript.Arguments.Count > 1 Then nodeExe = WScript.Arguments(1)

shell.CurrentDirectory = appRoot
command = """" & nodeExe & """ """ & appRoot & "\server\index.js"" --port " & port
' Window style 0 = hidden. Wait for the server process so the scheduled task
' can report/restart it if it exits unexpectedly.
shell.Run command, 0, True
