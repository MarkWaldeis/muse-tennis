# 🎾 Muse Tennis 3D

Ein interaktives 3D-Tennisspiel direkt im Browser, entwickelt mit **Three.js** auf einem hochdetaillierten **Wimbledon Centre Court**. Mit vollständigem Ballwechsel-System, Aufschlag-Mechanik mit Timing-Bar, Ballphysik, automatischer Vorhand-/Rückhand-Auswahl, intelligenter Gegner-KI und offiziellem Tennis-Zählsystem.

## 🚀 Direkt spielen

👉 **[https://markwaldeis.github.io/muse-tennis/](https://markwaldeis.github.io/muse-tennis/)** 👈

*(Keine Installation oder Build-Schritt erforderlich – läuft sofort in jedem modernen Webbrowser!)*

---

## 🎮 Steuerung

| Taste / Aktion | Funktion |
|---|---|
| **W, A, S, D** / **Stick** | Laufen. Den goldenen Zielring schiebst du beim Aufschlag, im Schwung oder wenn du fast stillstehst; im Sprint bleibt das Ziel stehen. W/vorne = tiefer, S/hinten = kürzer, A/D = quer. |
| **LEERTASTE** / **SCHLAG-Knopf** | **Aufschlag:** Ball hochwerfen & im grünen Bereich schlagen (Ring im Aufschlagfeld)<br>**Rallye:** Ball schlagen – früh und gesetzt ein flacher Drive, spät ein hoher Float; Landung auf dem goldenen Ring |
| **C** / **📷 Cam** | Kamera wechseln (Follow-Cam an/aus – Orbit-Kamera mit Maus/Finger steuerbar) |
| **R** / **↻ Neu** | Ballwechsel / Aufschlag neu starten (Safety Reset) |
| **Linksklick + Ziehen** | Kamera um den Court rotieren (wenn Follow-Cam aus oder ergänzend) |
| **Mausrad** / **Pinch** | Zoom |

---

## ✨ Features

- 🎬 **3D-Hauptmenü:** Court als Bühne, Charakter-Vorschau, Platzwahl (Centre Court oder mediterrane Clay Arena) und KI-Stärke als Glas-HUD.
- 🐣 **Geriggter Mascot-Spieler:** Tripo-Vogel mit Mixamo-Skeleton (Finger, Zehen, Schwanz, Kamm), volumetrischem Skinning und Tennisschläger in der Schlaghand.
- 🏟️ **Zwei Plätze:** **Wimbledon Centre Court** (Rasen, Stadion-Schüssel, Royal Box, Retractable Roof) und **Mediterranean Clay Arena** (Sandplatz, Villa, Meer, goldene Stunde). Beide teilen dieselben ITF-Maße, Animationen, Physik und das Zählwerk.
- 🎯 **Sichtbares Zielen:** Goldener Lande-Ring auf der gegnerischen Hälfte. WASD bzw. Stick schieben das Ziel; es bleibt beim Loslassen stehen. Beim Aufschlag klebt der Ring im diagonalen Aufschlagfeld, der Timing-Balken steuert Tempo und Genauigkeit.
- 🎯 **Aufschlag-Mechanik:** Interaktives Aufschlag-Minigame mit Ballwurf und Sweet-Spot Timing-Balken – dieselben Ready/Toss/Strike/Follow-Animationen wie zuvor, jetzt auf dem Rasen hinter der Grundlinie.
- ⚡ **Ballphysik & Rallye:** Schwerkraft, Luftwiderstand, Netzkollision, Doppeldotz- und Aus-Erkennung. Früh am Ball = durchgezogener Drive, spät und gestreckt = hoher, weicher Float.
- 🤖 **KI-Gegner:** Drei Stärken (Leicht / Mittel / Profi). Spielt meist ins offene Feld, jagt klare Aus-Bälle nicht und geht nach dem Schlag zurück.
- 🎾 **Automatische Schlagwahl:** Spieler erkennt Ballposition und führt automatisch Vorhand- oder Rückhandschwünge aus.
- 📊 **Tennis-Zählwerk:** Echte Zählweise (0, 15, 30, 40, Einstand, Vorteil, Spiele, Sätze) mit wechselnder Aufschlagseite.
- 🎥 **Dual-Kamera-System:** Dynamische Follow-Kamera hinter dem Spieler oder freie Orbit-Kamera zur Stadionübersicht.
- 📱 **Touch-Steuerung:** Virtueller Stick und großer Schlag-Knopf für Handy und Tablet, inklusive Aufschlag-Timing.

---

## 📁 Projektstruktur

```text
muse-tennis/
├── index.html                         # Spiel (Three.js, Logik, UI, Physik)
├── maps.js                            # Platz-Katalog (Centre Court / Clay Arena)
├── wimbledon-stadium.js               # Centre-Court-Stadion, Rasen, Dach, Props
├── mediterranean-arena.js             # Clay-Arena, Licht, Meer, GLB-Loader
├── assets/mediterranean-arena.glb     # Blender-Map (Villa, Vegetation, Yachten)
├── assets/mascot-bird-rigged.glb      # Geriggter Spieler (Mixamo-Skeleton + Finger)
├── assets/mascot-bird-rig.json        # Knochenkarte / Bind-Metadaten
├── tools/rig_character.py             # CPU-Auto-Rigger (voxel-geodesic heat)
├── tests/maps.test.mjs                # Map-Katalog, GLB, Menü-Verdrahtung
├── mascot bird 3d model.glb           # Ungeriggtes Tripo-Quellmesh
├── .gitignore
└── README.md
```

---

## 🛠️ Lokale Entwicklung

Einfach die Datei `index.html` über einen lokalen Webserver öffnen (z. B. VS Code Live Server oder `python -m http.server 8000`). Ein Datei-Doppelklick (`file://`) reicht nicht, weil das Stadion-Modul per ES-Import geladen wird.

---

## 🔮 Roadmap / Geplante Weiterentwicklung

- [ ] Soundeffekte (Schlaggeräusche, Ballaufprall, Netzkontakt, Schiedsrichteransagen)
- [ ] Sound- und Jubelanimationen für Punkte und Asse
- [x] Wimbledon Centre Court (Rasen, Stadion, Retractable Roof)
- [x] Mediterranean Clay Arena (Sandplatz, Villa, Meer)
- [ ] Weitere Beläge (Roland Garros, US Open Hartplatz)
- [x] Touch-Steuerung für mobile Endgeräte (iOS / Android)
- [x] Einstellbare KI-Schwierigkeitsgrade (Leicht, Mittel, Profi)
- [ ] Lokaler 2-Spieler-Modus (Split-Screen oder Dual-Controls)
