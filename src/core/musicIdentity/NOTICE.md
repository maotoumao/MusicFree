# Traditional Chinese normalization

`traditional.json` contains the first-choice mappings from OpenCC's `TSCharacters.txt`
and `TSPhrases.txt`, obtained from the installed `opencc-python-reimplemented` 0.1.7
distribution. The conversion applies phrases before characters and does not contain
artist-specific aliases or recommendation rules.

OpenCC: https://github.com/BYVoid/OpenCC

The Apache-2.0 license is included in `OPENCC-LICENSE.txt`. No new runtime package or
network service is required for normalization.
