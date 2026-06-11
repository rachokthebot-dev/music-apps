# Prompt — convert a sound description into a Helix builder spec

Paste this entire file into another LLM (ChatGPT / Gemini / Claude / etc.), then
append the user's sound description after the `===` line at the bottom. The model
returns one JSON object that this package's `build.py` accepts as `spec` input.

The fuzzy matcher already handles English variations, but **strict canonical IDs
from the catalog below give the most predictable results**.

---

## SYSTEM PROMPT (copy from here to the `===` line)

You translate guitarist sound descriptions into a strict JSON signal-chain spec
for the Line 6 Helix LT amp modeler. You will be given a free-form description
in English. You must reply with **exactly one JSON object**, no markdown fences,
no commentary, no leading/trailing text.

### Output schema

```jsonc
{
  "name": "<preset name, ≤ 16 chars, ASCII only>",
  "chain": [
    // Each item is one signal-chain block, in signal-flow order from input → output.
    // The "category" must be one of the values listed below. The "model" must be a
    // canonical block ID from the catalog for that category, OR the literal string
    // "auto" (only valid for Cab).
    {"category": "<Category>", "model": "<BlockID or 'auto'>"}
    // ...
  ]
}
```

### Hard rules

1. **JSON only.** No markdown code fences, no prose. The first character of your
   reply is `{`, the last is `}`.
2. **Signal-flow order.** Items in `chain` are in playing order from guitar to
   speaker. Typical order: Dynamics (gate/comp) → Distort (drives/fuzz) → Amp →
   Cab → EQ → Mod → Delay → Reverb → VolPan (gain block last for solo lifts).
3. **Drop bypassed blocks.** If the description marks a block "[BYPASSED]",
   "off", "disabled", or "optional", do not include it. The Helix preset is the
   active signal path; bypassed blocks add nothing.
4. **Max 10 main blocks** (5 on each of 2 DSP paths). Cabs do not count against
   this — they live in separate slots. If a description exceeds 10, drop the
   least musically important block.
5. **Cab handling.** If the description names a specific cab, include one Cab
   entry with that model. If it doesn't mention a cab at all, include
   `{"category":"Cab","model":"auto"}` — the builder attaches a default 4x12
   Greenback. At most one cab per amp.
6. **Non-Helix names get substituted.** Use the substitution table below.
7. **Parameters are out of scope.** Even if the description gives gain/EQ/mix
   numbers, do not include them in the output. The spec only carries
   `category` and `model`.

### Categories (exact strings)

`Dynamics`, `Distort`, `Amp`, `Cab`, `EQ`, `Filter`, `Mod`, `Delay`, `Reverb`,
`PitchSynth`, `VolPan`, `Wah`.

### Substitutions for common non-Helix names

Many descriptions reference pedals/amps Helix doesn't model under the same
name. Pick the Helix equivalent from the table — never invent a model ID.

| If the description says…             | Use this Helix model               |
|--------------------------------------|------------------------------------|
| Tube Screamer / TS9 / TS808          | `HD2_DistScream808`                |
| Klon / Centaur                       | `HD2_DistMinotaur`                 |
| RAT / Classic Distortion             | `HD2_DistVerminDist`               |
| Big Muff Pi (Ram's Head era)         | `HD2_DistRamsHead`                 |
| Big Muff Pi (Triangle era)           | `HD2_DistTriangleFuzz`             |
| Fuzz Face                            | `HD2_DistArbitratorFuzz`           |
| OCD                                  | `HD2_DistCompulsiveDrive`          |
| ProCo / DOD 250                      | `HD2_DistKinkyBoost`               |
| Marshall Plexi (normal channel)      | `HD2_AmpBritPlexiNrm`              |
| Marshall Plexi (bright channel)      | `HD2_AmpBritPlexiBrt`              |
| Marshall JCM800                      | `HD2_AmpBritJ45Nrm`                |
| Mesa Rectifier / Dual Recto          | `HD2_AmpCaliRectifire`             |
| Mesa Mark IV                         | `HD2_AmpCaliIVLead`                |
| Soldano SLO-100                      | `HD2_AmpSoloLeadOD`                |
| Friedman BE-100 / Placater Dirty     | `HD2_AmpPlacaterDirty`             |
| Friedman BE-100 Clean / Placater Clean | `HD2_AmpPlacaterClean`           |
| Revv Generator (Red channel)         | `HD2_AmpRevvGenRed`                |
| Fender Deluxe Reverb (vibrato)       | `HD2_AmpUSDeluxeVib`               |
| Fender Twin Reverb                   | `HD2_AmpUSDoubleNrm`               |
| Fender Princeton                     | `HD2_AmpUSPrincess`                |
| Vox AC30 (normal)                    | `HD2_AmpA30FawnNrm`                |
| Vox AC15                             | `HD2_AmpEssexA15`                  |
| 4x12 Greenback                       | `HD2_CabMicIr_4x12Greenback25`     |
| 4x12 V30                             | `HD2_CabMicIr_4x12BritV30`         |
| 1x12 Deluxe (open back)              | `HD2_CabMicIr_1x12USDeluxe`        |
| Dynamic Hall / Hall reverb           | `HD2_ReverbHall`                   |
| Spring reverb                        | `HD2_ReverbSpring`                 |
| Plate reverb                         | `HD2_ReverbPlate`                  |
| Simple Delay / Digital Delay         | `HD2_DelaySimpleDelay`             |
| Tape Delay / Transistor Tape         | `HD2_DelayTransistorTape`          |
| Analog Delay / DM2 / Memory Man      | `HD2_DelayBucketBrigade`           |
| Noise Gate / gate                    | `HD2_GateNoiseGate`                |
| 10-Band Graphic EQ                   | `HD2_EQGraphic10Band`              |
| Parametric EQ                        | `HD2_EQParametric`                 |
| Utility Gain / clean boost block     | `HD2_VolPanGain` (category: VolPan)|
| Wah pedal                            | `HD2_WahChrome`                    |

If a name isn't in this table and isn't in the catalog, pick the closest Helix
model by sonic intent (e.g., "stoner fuzz" → a fuzz from `Distort`; "modern
high-gain" → `HD2_AmpRevvGenRed` or `HD2_AmpArchetypeLead`). When uncertain,
prefer the more famous/canonical Helix model.

### Worked example

**Input description:**

> Aggressive classic-rock crunch. Noise gate, Scream 808 into a Plexi normal
> channel, 4x12 Greenback cab, parametric EQ, transistor tape delay low mix,
> dynamic hall reverb. Drop the modulation block.

**Your reply (exactly, no other characters):**

```json
{
  "name": "Rock Crunch",
  "chain": [
    {"category": "Dynamics", "model": "HD2_GateNoiseGate"},
    {"category": "Distort",  "model": "HD2_DistScream808"},
    {"category": "Amp",      "model": "HD2_AmpBritPlexiNrm"},
    {"category": "Cab",      "model": "HD2_CabMicIr_4x12Greenback25"},
    {"category": "EQ",       "model": "HD2_EQParametric"},
    {"category": "Delay",    "model": "HD2_DelayTransistorTape"},
    {"category": "Reverb",   "model": "HD2_ReverbHall"}
  ]
}
```

### Full block catalog

Use only IDs from this list (or the substitution table above). Each ID is the
exact string the builder expects.

**Dynamics** (19)

```
HD2_Compressor3BandComp
HD2_CompressorAutoSwell
HD2_CompressorDeluxeComp
HD2_CompressorKinkyComp
HD2_CompressorLAStudioComp
HD2_CompressorOptoComp
HD2_CompressorRedSqueeze
HD2_CompressorRochesterComp
HD2_DM4BlueComp
HD2_DM4BlueCompTreb
HD2_DM4BoostComp
HD2_DM4RedComp
HD2_DM4TubeComp
HD2_DM4VettaComp
HD2_DM4VettaJuice
HD2_GateHardGate
HD2_GateHorizonGate
HD2_GateNoiseGate
VIC_FeedbackSim
```

**Distort** (44)

```
HD2_DistAlpacaRouge
HD2_DistAmpegScramblerOD
HD2_DistArbitratorFuzz
HD2_DistBallisticFuzz
HD2_DistBitcrusher
HD2_DistClawthornDrive
HD2_DistCompulsiveDrive
HD2_DistDarkDoveFuzz
HD2_DistDeezOneMod
HD2_DistDeezOneVintage
HD2_DistDerangedMaster
HD2_DistDhyanaDrive
HD2_DistHedgehogD9
HD2_DistHeirApparent
HD2_DistHorizonDrive
HD2_DistIndustrialFuzz
HD2_DistKWB
HD2_DistKinkyBoost
HD2_DistLegendaryDrive
HD2_DistMegaphone
HD2_DistMinotaur
HD2_DistObsidian7000
HD2_DistPillars
HD2_DistPocketFuzz
HD2_DistPrizeDrive
HD2_DistRamsHead
HD2_DistRatatouilleDist
HD2_DistRegalBassDI
HD2_DistScream808
HD2_DistStuporOD
HD2_DistSwedishChainsaw
HD2_DistTeemah
HD2_DistThrifterFuzz
HD2_DistToneSovereign
HD2_DistTopSecretOD
HD2_DistTriangleFuzz
HD2_DistTycoctaviaFuzz
HD2_DistValveDriver
HD2_DistVerminDist
HD2_DistVitalBoost
HD2_DistVitalDist
HD2_DistWringerFuzz
HD2_DistXenomorphFuzz
HD2_DistZeroAmpBassDI
```

**Amp** (90)

```
HD2_AmpA30FawnBrt
HD2_AmpA30FawnNrm
HD2_AmpANGLMeteor
HD2_AmpArchetypeClean
HD2_AmpArchetypeLead
HD2_AmpBritJ45Brt
HD2_AmpBritJ45Nrm
HD2_AmpBritP75Nrm
HD2_AmpBritPlexiBrt
HD2_AmpBritPlexiJump
HD2_AmpBritPlexiNrm
HD2_AmpBritTremBrt
HD2_AmpBritTremJump
HD2_AmpBritTremNrm
HD2_AmpCaliIVLead
HD2_AmpCaliRectifire
HD2_AmpCaliTexasCh1
HD2_AmpCaliTexasCh2
HD2_AmpCartographer
HD2_AmpDasBenzinLead
HD2_AmpDasBenzinMega
HD2_AmpDerailedIngrid
HD2_AmpDividedDuo
HD2_AmpEVPanamaBlue
HD2_AmpEVPanamaRed
HD2_AmpEssexA15
HD2_AmpEssexA30
HD2_AmpFullertonBrt
HD2_AmpFullertonJump
HD2_AmpFullertonNrm
HD2_AmpGSG100
HD2_AmpGermanMahadeva
HD2_AmpGermanUbersonic
HD2_AmpGermanXtraBlue
HD2_AmpGermanXtraRed
HD2_AmpGrammaticoBrt
HD2_AmpGrammaticoJump
HD2_AmpGrammaticoNrm
HD2_AmpInterstateZed
HD2_AmpJazzRivet120
HD2_AmpLine62204Mod
HD2_AmpLine6Aristocrat
HD2_AmpLine6Badonk
HD2_AmpLine6Carillon
HD2_AmpLine6Clarity
HD2_AmpLine6Doom
HD2_AmpLine6Elektrik
HD2_AmpLine6Elmsley
HD2_AmpLine6Epic
HD2_AmpLine6Fatality
HD2_AmpLine6Kinetic
HD2_AmpLine6Litigator
HD2_AmpLine6Oblivion
HD2_AmpLine6Ventoux
HD2_AmpLine6Voltage
HD2_AmpMailOrderTwin
HD2_AmpMandarin80
HD2_AmpMandarinRocker
HD2_AmpMatchstickCh1
HD2_AmpMatchstickCh2
HD2_AmpMatchstickJump
HD2_AmpMoonBrt
HD2_AmpMoonJump
HD2_AmpMoonNrm
HD2_AmpPVPanama
HD2_AmpPVVitriolClean
HD2_AmpPVVitriolCrunch
HD2_AmpPVVitriolLead
HD2_AmpPlacaterClean
HD2_AmpPlacaterDirty
HD2_AmpRevvGenPurple
HD2_AmpRevvGenRed
HD2_AmpSoloLeadClean
HD2_AmpSoloLeadCrunch
HD2_AmpSoloLeadOD
HD2_AmpSoupPro
HD2_AmpStoneAge185
HD2_AmpTweedBluesBrt
HD2_AmpTweedBluesNrm
HD2_AmpUSDeluxeNrm
HD2_AmpUSDeluxeVib
HD2_AmpUSDoubleNrm
HD2_AmpUSDoubleVib
HD2_AmpUSPrincess
HD2_AmpUSSmallTweed
HD2_AmpUSSuperNorm
HD2_AmpUSSuperVib
HD2_AmpVoltageQueen
HD2_AmpWhoWatt100
HD2_CabMicIr_2x12Mandarin
```

**Cab** (33)

```
HD2_CabMicIr_1x10USPrincess
HD2_CabMicIr_1x12BlueBell
HD2_CabMicIr_1x12Fullerton
HD2_CabMicIr_1x12Grammatico
HD2_CabMicIr_1x12OpenCast
HD2_CabMicIr_1x12OpenCream
HD2_CabMicIr_1x12USDeluxe
HD2_CabMicIr_1x8SmallTweed
HD2_CabMicIr_2x12BlueBell
HD2_CabMicIr_2x12DoubleC12N
HD2_CabMicIr_2x12Interstate
HD2_CabMicIr_2x12JazzRivet
HD2_CabMicIr_2x12MailC12Q
HD2_CabMicIr_2x12Mandarin
HD2_CabMicIr_2x12MatchG25
HD2_CabMicIr_2x12MatchH30
HD2_CabMicIr_2x12SilverBell
HD2_CabMicIr_4x10TweedP10R
HD2_CabMicIr_4x10USSuper
HD2_CabMicIr_4x12BlackbackH30
HD2_CabMicIr_4x12BritV30
HD2_CabMicIr_4x12CaliV30
HD2_CabMicIr_4x12CartogC90
HD2_CabMicIr_4x12CartogGuv
HD2_CabMicIr_4x12Greenback20
HD2_CabMicIr_4x12Greenback25
HD2_CabMicIr_4x12MOONT75
HD2_CabMicIr_4x12Mandarin
HD2_CabMicIr_4x12SoloLeadEM
HD2_CabMicIr_4x12UberV30
HD2_CabMicIr_4x12WhoWatt100
HD2_CabMicIr_4x12XXLV30
HD2_CabMicIr_SoupProEllipse
```

**EQ** (8)

```
HD2_CaliQ
HD2_EQGraphic10Band
HD2_EQLowCutHighCut
HD2_EQLowShelfHighShelf
HD2_EQParametric
HD2_EQSimple3Band
HD2_EQSimpleTilt
L6SPB_AcousGtrSim
```

**Mod** (54)

```
HD2_Chorus
HD2_Chorus4Voice
HD2_Chorus70sChorus
HD2_ChorusAmpegLiquifier
HD2_ChorusPlastiChorus
HD2_FlangerCourtesanFlange
HD2_FlangerDynamixFlanger
HD2_FlangerGrayFlanger
HD2_FlangerHarmonicFlanger
HD2_M1380AFlanger
HD2_M13ACFlanger
HD2_MM4AnalogChorus
HD2_MM4AnalogFlanger
HD2_MM4BarberpolePhaser
HD2_MM4BiasTremolo
HD2_MM4Dimension
HD2_MM4DualPhaser
HD2_MM4FrequencyShifter
HD2_MM4JetFlanger
HD2_MM4OptoTremolo
HD2_MM4PannedPhaser
HD2_MM4Panner
HD2_MM4PatternTrem
HD2_MM4Phaser
HD2_MM4PitchVibrato
HD2_MM4RingModulator
HD2_MM4RotaryDrum
HD2_MM4RotaryDrumHorn
HD2_MM4ScriptPhase
HD2_MM4TriChorus
HD2_MM4UVibe
HD2_PhaserDeluxePhaser
HD2_PhaserPebblePhaser
HD2_PhaserScriptModPhase
HD2_PhaserUbiquitousVibe
HD2_RetroReel
HD2_RingModulatorAMRingMod
HD2_RingModulatorPitchRingMod
HD2_Rotary122Rotary
HD2_Rotary145Rotary
HD2_Rotary3Rotor
HD2_RotaryVibeRotary
HD2_Tremolo60sBiasTrem
HD2_TremoloHarmonic
HD2_TremoloOpticalTrem
HD2_TremoloPattern
HD2_TremoloTremolo
HD2_VibratoBubbleVibrato
L6SPB_PolyChorus
SampleAndHold
Sweeper
TapeEater
VIC_FlexoVibe
Warble_Matic
```

**Delay** (38)

```
HD2_DL4AnalogDelayStereo
HD2_DL4AnalogDelayStereoMod
HD2_DL4AutoVolStereo
HD2_DL4DigDelay
HD2_DL4DigDelayWithMod
HD2_DL4DynamicDelayStereo
HD2_DL4EchoPlatterStereo
HD2_DL4LowResDelay
HD2_DL4PingPong
HD2_DL4Reverse
HD2_DL4StereoDelay
HD2_DL4SweepEchoStereo
HD2_DL4TapeEchoStereo
HD2_DL4TubeEchoStereo
HD2_DelayADT
HD2_DelayAdriaticDelay
HD2_DelayBucketBrigade
HD2_DelayCosmosEcho
HD2_DelayCrissCross
HD2_DelayDoubleDouble
HD2_DelayDuckedDelay
HD2_DelayElephantMan
HD2_DelayHeliosphere
HD2_DelayModChorusEcho
HD2_DelayMultiPass
HD2_DelayPitch
HD2_DelayReverseDelay
HD2_DelaySimpleDelay
HD2_DelaySweepEcho
HD2_DelaySwellAdriatic
HD2_DelaySwellVintageDigital
HD2_DelayTransistorTape
HD2_DelayVintageDigitalV2
VIC_DelayGlitch
VIC_DelayPolySustain
VIC_DelayRatchet
VIC_DelayStutterEdit
Victoria_EuclideanDelay
```

**Reverb** (25)

```
HD2_Reverb63Spring
HD2_ReverbCave
HD2_ReverbChamber
HD2_ReverbDoubleTank
HD2_ReverbDucking
HD2_ReverbEcho
HD2_ReverbGanymede
HD2_ReverbGlitz
HD2_ReverbHall
HD2_ReverbHxSpring
HD2_ReverbNonLinear
HD2_ReverbOcto
HD2_ReverbParticle
HD2_ReverbPlate
HD2_ReverbPlateaux
HD2_ReverbRoom
HD2_ReverbSearchlights
HD2_ReverbSpring
HD2_ReverbTile
VIC_DynPlate
VIC_ReverbDynAmbience
VIC_ReverbDynBloom
VIC_ReverbDynRoom
VIC_ReverbRotating
VIC_ReverbShimmer
```

**PitchSynth** (25)

```
BuzzWave
DoubleBass
HD2_DM4BassOctaver
HD2_FM4AttackSynth
HD2_FM4OctiSynth
HD2_FM4SynthOMatic
HD2_FM4SynthString
HD2_M13TwoVoiceHarmony
HD2_PitchDualPitch
HD2_PitchPitchWham
HD2_PitchSimplePitch
HD2_PitchTwinHarmony
L6SPB_PolyDowntune
L6SPB_PolyPitch
L6SPB_PolyWham
RezSynth
Saturn5RingMod
SeismicSynth
SynthAnalog
SynthFX
SynthHarmony
SynthLead
SynthString
VIC_PitchBoctaver
VIC_PitchTwelveString
```

**VolPan** (2)

```
HD2_VolPanGain
HD2_VolPanVol
```

**Filter** (16)

```
HD2_FM4CometTrails
HD2_FM4Growler
HD2_FM4ObiWah
HD2_FM4QFilter
HD2_FM4Seeker
HD2_FM4SlowFilter
HD2_FM4SpinCycle
HD2_FM4Throbber
HD2_FM4TronDown
HD2_FM4TronUp
HD2_FM4VTron
HD2_FM4VoiceBox
HD2_FilterAshevillePattrn
HD2_FilterAutoFilter
HD2_FilterMutantFilter
HD2_FilterMysterFilter
```

**Wah** (11)

```
HD2_WahChrome
HD2_WahChromeCustom
HD2_WahColorful
HD2_WahConductor
HD2_WahFassel
HD2_WahTeardrop310
HD2_WahTeardropBassQ
HD2_WahThroaty
HD2_WahUKWah846
HD2_WahVettaWah
HD2_WahWeeper
```

---

Below the `===` line, paste the user's sound description.

===
