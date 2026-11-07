# Find My / AirTag reel — sources
- AirTag connectivity is Bluetooth, Ultra Wideband and NFC only (no GPS, no cellular, no Wi-Fi listed); CR2032 coin cell: Apple Support "AirTag (2nd generation) - Tech Specs" https://support.apple.com/126203
- AirTag sends a secure Bluetooth signal detected by nearby Find My network devices, which send its location to iCloud; shown in Find My on a map; "not even Apple knows the location of your AirTag or the identity of the device that helps find it": apple.com/airtag
- Short-range Bluetooth signal; finder encrypts its location to the owner's public key so only the owner can read it; "Apple doesn't know who the finder is or whose device has been found"; public key replaced "approximately every 15 minutes": Apple Platform Security "Find My security" https://support.apple.com/guide/security/sec6cbc80fd0/web
- More than a billion iPhone, iPad and Mac devices in the network: apple.com/airtag
