# How the engines are tested, 2026-09-07

A note for this repository, because proofs here certify what is here, and a browser executing an application is a different question. Confidence transfers only over inputs actually compared.

## What a harness must do before it may report on an engine

1. **Read sentinels, never rendering.** A state is asserted from a value the product publishes at the moment the state becomes true. A test that reads pixels or text layout is reading tea leaves.
2. **Run a control first, in the same session.** If the control fails the run is invalid and nothing else in it is scored. A control that shares no inputs or capabilities with the cases it licenses is not a control.
3. **Measure both sides of any change identically.** The same function reads the before state and the after state, or the comparison proves nothing. This was paid for on 2026-09-07 by a study that reported a broken control as working on six shapes.
4. **Cover the shapes together.** Android portrait and landscape and desktop in one run. A control that fires on one phone in landscape can fail on a smaller one, measured at 658 by 320.
5. **Say what it could not see.** A distance to the nearest mapped asset states how many assets were invisible. A run with the network cut states that it cannot speak for the online product.
6. **Refuse rather than guess**, and record the refusal with its reason.

## What it costs, so the budget is known

Measured on a twenty-core laptop: one browser session on the map averages 51.6% of the machine, two average 84.8%, and thread and paint flags change that by about a point. The cost is the map's own render loop. **Bound the duration, not the count.** A study that opens, measures for fifteen seconds and closes costs almost nothing; the same tool held open for hours is what overheats a machine.

## What was actually efficient, and what was not

**Read this before commissioning anything.** These are the measured yields from 2026-09-07, a day that cost **$357.69** in model usage, most of it on runners and scheduled checks.

| method | what it cost | what it found |
| --- | --- | --- |
| **The owner using the product on a real phone** | about two hours of tapping | **20 defects**, including a control that half works, an interconnector presented as domestic, offshore engines silent, a placeholder title, a black screen in landscape, and a missing size filter |
| **Reading the code and the data with targeted searches** | minutes, negligible tokens | Eight of ten interconnectors hold no far converter; the counterparty country is already held for every link; the voltage layers are genuinely OpenStreetMap; the size slider still exists in another repository |
| **Adversarial review of the stated logic** | two briefs, one page each | An unsafe applicability rule, a cycle guard that collides on our own identifiers, a quarantine that could never reopen, a pass that hid a gap, and a power flow that can converge to artefacts |
| **A study written to answer one question** | ninety seconds of browser time | Located the layers fault exactly: the label flips, the panel does not move, identical on both compositions, and it fails entirely on the smallest landscape screen |
| **Automated repeat runs** | **30.4 million tokens across 19 scheduled checks**, plus five hours of the machine at 60 to 92% CPU | **615 identical passes. Zero product defects.** It established determinism in the first hour and then confirmed it 600 more times |

**The lesson, stated plainly.** The most expensive instrument found the least. A person with the actual product on the actual device found more in two hours than five hours of continuous automation and a fleet of scheduled checks. The automation was not useless: it proved the harness was stable and it located a fault precisely once someone told it where to look. But it cannot notice that a button feels dead, that a card is in the way, or that a link claims to be international while never leaving the country.

**So the order of work is:**

1. **Use the product.** On the real device, in both orientations. Report what feels wrong, even vaguely.
2. **Read the code and the data** to check the claim before building anything. Half of tonight's tickets changed shape once someone looked, and two turned out to be the opposite of the report.
3. **Write one study that answers one question**, then close the session.
4. **Automate only what must be re-checked**, and only after it has failed once. A test that has never failed is a test that has not yet earned its schedule.

**What to avoid, with the receipts.** Scheduled checks every fifteen minutes consumed 30.4 million tokens for nineteen answers that mostly said nothing changed. Long sessions are expensive: 96% of the day's usage sat above 150k of context. Repeat runs of identical bytes stop informing after the first few. And an idle floor is not a target: a runner that stops at its own floor slept thirteen minutes in every fifteen while reporting that it was working.

## Setting the runners up on Windows PowerShell

Everything below was used tonight from a cold start. This is Windows PowerShell 5.1, so no pipeline chain operators, no ternaries, and `wmic` is gone.

**Where things live.** Runners on the SSD at `D:\gridatlas-ci`. The browser driver is already installed at `C:\Users\vikra\LocalCI\PipelineNews-GridAtlas\v004\node_modules\playwright` at version 1.58.2. The real-device bridge is `D:\android\platform-tools\adb.exe`. Nothing is installed globally and no service is registered.

**Run one study. One session, opened and closed:**

```powershell
node D:\gridatlas-ci\overnight.mjs GG-027
```

**Measure what a session costs before commissioning more:**

```powershell
node D:\gridatlas-ci\smoke.mjs
node D:\gridatlas-ci\smoke.mjs --quiet --one
```

**Start a windowed runner detached, so it outlives the session that started it:**

```powershell
$env:CI_WINDOW_MIN = '360'
$p = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'D:\gridatlas-ci\pair-runner.mjs' `
  -WorkingDirectory 'D:\gridatlas-ci' -WindowStyle Hidden `
  -RedirectStandardOutput 'D:\gridatlas-ci\pair-runner.stdout.log' `
  -RedirectStandardError  'D:\gridatlas-ci\pair-runner.stderr.log' -PassThru
'runner pid ' + $p.Id
```

**Check what is alive, matched by command line rather than by process name:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'pair-runner|overnight|worker' } |
  ForEach-Object { $_.ProcessId.ToString() + '  ' + $_.CommandLine }
```

**Stop everything and give the memory back:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'pair-runner|overnight|worker' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
```

**Watch the machine while it works.** This firmware exposes no temperature sensor, so the clock against its rated maximum is the throttle signal:

```powershell
(Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 2 -MaxSamples 3).CounterSamples |
  ForEach-Object { '{0:N0}%' -f $_.CookedValue }
Get-CimInstance Win32_Processor | Select-Object -First 1 |
  ForEach-Object { 'clock ' + $_.CurrentClockSpeed + ' of ' + $_.MaxClockSpeed + ' MHz' }
'free RAM {0:N1} GB' -f ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB)
```

**Drive a real handset instead of a device profile.** Enable developer options and USB debugging on the phone, plug it in, accept the prompt on the phone, then:

```powershell
D:\android\platform-tools\adb.exe devices
```

A listed device can be driven directly by the browser driver. The phone renders, so the laptop stays cool. No emulator and no Android Studio: the whole bridge was a 7.7 MB download and 19 MB on disk.

**Pitfalls that cost real time, recorded so they are not rediscovered.** A Bash heredoc halves backslashes, so write a script to a file rather than piping it. An apostrophe inside a single-quoted shell string ends the string. A Windows checkout rewrites line endings, so hash git blobs rather than working copies. And a backtick is the line continuation character here, not a backslash.

## What this implies for the engine datasheets

Each cable engine's datasheet is the contract a harness asserts against: the question it answers, its endpoints, its geometry, its inputs, its outputs and how it is allowed to fall silent. An engine without a datasheet cannot be tested, only exercised. The datasheets live in the analysis repository alongside the capsule of the engines that already work.
