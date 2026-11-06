# Tap-to-pay reel — sources
- Contactless card has no battery; its chip is powered through the coil antenna by the terminal's RF field: US patent 9038894 (USPTO full text: "does not include a battery or other internal power source ... collects energy ... from the RF transmissions from the terminal")
- NFC: 13.56 MHz, works within about 4 cm (~1.6 in), inductive (magnetic) coupling: IEEE TechNav "NFC" — https://technav.ieee.org/topic/nfc/
- Reader continuously generates the carrier field; passive target draws power from it: NFC overview (initiator powers passive target)
- One-time code per transaction (EMV dynamic cryptogram): PSCU contactless FAQ — https://pscu.com/contactless-faqs ; Apple Pay security overview (transaction-specific dynamic security code)
- Phone never sends the real card number (Device Account Number + dynamic security code): Apple Support "Apple Pay security and privacy overview" — https://support.apple.com/101554 ; Apple Newsroom 2014-09-09
