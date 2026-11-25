$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$qaRoot=(Resolve-Path "$PSScriptRoot/../offline/q41132").Path
$env:POPTROPICA_DESKTOP_QA_ROOT=$qaRoot
$exe=(Resolve-Path "$PSScriptRoot/../../outputs/Poptropica.exe").Path
$app=[System.Diagnostics.Process]::Start($exe,'--offline')
function Find-AppControl($owner,$name) {
 $cond=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$name)
 $until=[DateTime]::UtcNow.AddSeconds(55)
 do {
  $item=$owner.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cond)
  if($item){return $item}
  Start-Sleep -Milliseconds 350
 } while([DateTime]::UtcNow -lt $until)
 throw "Control missing: $name"
}
try {
 for($i=0; $i -lt 60;$i++){ $app.Refresh();if($app.MainWindowHandle -ne [IntPtr]::Zero){break}; Start-Sleep -Milliseconds 300 }
 $original=$app.MainWindowHandle
 $window=[System.Windows.Automation.AutomationElement]::FromHandle($original)
 foreach($name in @('Settings','Check for updates')){
  $button=Find-AppControl $window $name
  $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
 }
 $result=Find-AppControl $window 'All caught up'
 if(!$result){throw 'Update status missing'}
 $app.Refresh()
 if($app.MainWindowHandle -ne $original){throw 'Host changed'}
 Write-Output 'Single-file app checked the public update server and displayed All caught up in the same window.'
} finally {
 $app.CloseMainWindow() | Out-Null
 if(!$app.WaitForExit(10000)){ $app.Kill() }
}
