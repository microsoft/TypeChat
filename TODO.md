## Commit analysis
* Get to the bottom of the CRLF vs LF issue
* .tsconfig
  * (Umesh d242adf7) Investigate override target to "es2016" from .tsconfig-google.json's "es2018" 
  * (Umesh 03fc71a8) Fix include for `test` to `tests`. 
* Examples folder
  * Should not import from the the build folder
  * Move into src
* Secrets
  * (steve e0d7e90e)
    * This key is alreay in github history
    * Get from environment
* Configuration
  * (steve ea2eeea5)
    * Review package.json files including `src`
    * Suppressing no-unpublished-import for spotify-typs
  * (steve 50646ca7)
    * Should not .gitignore *.bat
    * Can we use @types/spotify-api instead of spotify-types?
    * Should expected.txt go somewhere other than the root?
    * Can we remove examples/.gitignore now?


## Top issues
* Do we want to compile TS schema files used as data?
* apps/examples/music/sandbox.ts imports keys.json
* There's a lot of repetitive code in the examples. They all have the same structure. Can we refactor for commonality?
* Set up launch.json
* Secret management
  * .env or config file?
  * Investigate TS equivalent to .net config
    * https://www.npmjs.com/package/webpack-merge
    * https://www.npmjs.com/package/config
* Scratch/temporary working files (batch files, expected output, etc)
* No ability to run that requires API keys
* No unit tests
* Ground rules?
* Code review?