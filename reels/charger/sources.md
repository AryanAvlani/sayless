# Charger reel — sources
- Switching >100,000 times a second: TI UCC28782EVM 65 W USB-C PD charger, average switching frequency 150 kHz at full load — https://www.ti.com/document-viewer/lit/html/SLUUBZ3C ; TI UCC28780 65 W reference design runs up to 600 kHz
- US outlet 120 V, 60 Hz AC: ANSI C84.1 nominal 120 V service (common reference)
- Phone battery ~4 V: lithium-ion cell nominal 3.6–3.7 V, charged to ~4.2 V (Battery University BU-303 / BU-409)
- Rectify → switch → transformer steps voltage down (flyback): TI and onsemi charger designs; Embedded Computing teardown of Spigen GaN charger
- Faster switching → smaller transformer; GaN enables it; silicon ~65 kHz bobbin transformer (23 mm) vs GaN ~400 kHz planar (8 mm): Navitas investor deck 2022 — https://ir.navitassemi.com/static-files/3e91da8d-5ace-48f6-bb77-8d8020135d84 ; Electronic Design "GaN Delivers More Compact Power Supplies"
- Up to about a tenth of energy lost as heat: Navitas deck (silicon switching chargers ~90% efficient, GaN 95–98%); TI reference designs 92–94% peak; Navitas: lost energy is "burning up ... as heat which warms the charger in your hand"
