' Keep the worker hidden and let Task Scheduler observe its lifetime and exit code.
Option Explicit
Dim fileSystem, taskShell, projectRoot, nodePath, command, exitCode
Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set taskShell = CreateObject("WScript.Shell")
projectRoot = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
taskShell.CurrentDirectory = projectRoot
nodePath = "node.exe"
If WScript.Arguments.Count > 0 Then nodePath = WScript.Arguments(0)
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & projectRoot & "\scripts\amis-webhook-worker.mjs" & Chr(34)
exitCode = taskShell.Run(command, 0, True)
WScript.Quit exitCode
