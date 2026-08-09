const BS = String.fromCharCode(92)
function win(...parts:string[]) { return parts.join(BS) }

export function makeValidSystem(id:string, romDir:string) {
  const mediaBase = win('C:','media',id)
  return {
    id,
    fullName: id.toUpperCase(),
    configSource: 'es_systems.cfg',
    configOrigin: 'emudeck',
    romDirectory: romDir,
    extensionString: '.iso .chd',
    validExtensions: ['.iso','.chd'],
    matchingRomFileCount: 12,
    commands: [
      {
        label: 'PCSX2 QT',
        template: win('"%EMUPATH%','%EMULATOR_PCSX2%"') + ' -batch -nogui "%ROM_RAW%"',
        workingDirectoryTemplate: '%EMUDIR%',
        isFirstConfiguredCommand: true,
        findRules: [
          { identifier:'pcsx2', kind:'emulator', rules:[{ entries:[win('C:','Emulators','pcsx2','pcsx2-qt.exe')], type:'staticpath' }], source:'es_find_rules.xml' }
        ],
        identifiers: { emulatorIdentifiers:['pcsx2'], coreFiles:[], corePathIdentifiers:[] }
      }
    ],
    launchSelection: { selectedLabel:'PCSX2 QT', rule:'pcsx2', status:'STATICALLY_RESOLVED', source: win('D:','gamelists',id,'gamelist.xml'), systemAlternativeLabel:'PCSX2', perGameOverrideCount:0, perGameOverrides:[] },
    media: {
      covers:{ directory: win(mediaBase,'covers'), exists:true, fileCount:10, directRomBasenameMatches:8, nonDirectBasenameCount:2, filenamePattern:'<basename>.jpg', exceptionSamples:[] },
      marquees:{ directory: win(mediaBase,'marquees'), exists:false, fileCount:0, directRomBasenameMatches:0, nonDirectBasenameCount:0, filenamePattern:'', exceptionSamples:[] },
      miximages:{ directory: win(mediaBase,'miximages'), exists:false, fileCount:0, directRomBasenameMatches:0, nonDirectBasenameCount:0, filenamePattern:'', exceptionSamples:[] },
      physicalmedia:{ directory: win(mediaBase,'physicalmedia'), exists:false, fileCount:0, directRomBasenameMatches:0, nonDirectBasenameCount:0, filenamePattern:'', exceptionSamples:[] },
      screenshots:{ directory: win(mediaBase,'screenshots'), exists:true, fileCount:5, directRomBasenameMatches:5, nonDirectBasenameCount:0, filenamePattern:'', exceptionSamples:[] },
      titlescreens:{ directory: win(mediaBase,'titlescreens'), exists:false, fileCount:0, directRomBasenameMatches:0, nonDirectBasenameCount:0, filenamePattern:'', exceptionSamples:[] },
      videos:{ directory: win(mediaBase,'videos'), exists:true, fileCount:7, directRomBasenameMatches:6, nonDirectBasenameCount:1, filenamePattern:'', exceptionSamples:[] },
    },
    metadata:{ exists:true, favorites:2, gameEntries:12, gamelistPath: win('C:','gamelists',id,'gamelist.xml'), entriesWithPlayCount:3, entriesWithLastPlayed:3, fields:'name description favorite' }
  }
}

export function makeValidConfig(systems:any[]) {
  return {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    populatedSystemCount: systems.length,
    roots:{ rom: win('D:','Emulation','roms',''), gamelists: win('%USERPROFILE%','AppData','Roaming','EmuDeck'), scrapedMedia: win('C:','Emulation','storage','downloaded_media') },
    systems,
    authoritativeFiles:{ 'es_systems.cfg': win('%USERPROFILE%','AppData','Roaming','EmuDeck','es_systems.cfg') },
    ambiguities:[],
    launchArchitecture:{},
    mediaArchitecture:{},
    metadataArchitecture:{},
    settings:{}
  }
}

export function romDir(id:string){ return win('D:','Emulation','roms',id) }
