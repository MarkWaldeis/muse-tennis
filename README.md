# 🎾 Muse Tennis 3D

Ein interaktives 3D-Tennisspiel direkt im Browser, entwickelt mit **Three.js** im authentischen US Open Court-Design. Mit vollständigem Ballwechsel-System, Aufschlag-Mechanik mit Timing-Bar, Ballphysik, automatischer Vorhand-/Rückhand-Auswahl, intelligenter Gegner-KI und offiziellem Tennis-Zählsystem.

## 🚀 Direkt spielen

👉 **[https://markwaldeis.github.io/muse-tennis/](https://markwaldeis.github.io/muse-tennis/)** 👈

*(Keine Installation oder Build-Schritt erforderlich – läuft sofort in jedem modernen Webbrowser!)*

---

## 🎮 Steuerung

| Taste / Aktion | Funktion |
|---|---|
| **W, A, S, D** / **Stick** | Spieler über den Court bewegen |
| **LEERTASTE** / **SCHLAG-Knopf** | **Aufschlag:** Ball hochwerfen & im grünen Bereich schlagen<br>**Rallye:** Ball schlagen (Richtung wird durch Bewegung mitbestimmt) |
| **C** / **📷 Cam** | Kamera wechseln (Follow-Cam an/aus – Orbit-Kamera mit Maus/Finger steuerbar) |
| **R** / **↻ Neu** | Ballwechsel / Aufschlag neu starten (Safety Reset) |
| **Linksklick + Ziehen** | Kamera um den Court rotieren (wenn Follow-Cam aus oder ergänzend) |
| **Mausrad** / **Pinch** | Zoom |

---

## ✨ Features

- 🐣 **Geriggter Mascot-Spieler:** Tripo-Vogel mit Mixamo-Skeleton (Finger, Zehen, Schwanz, Kamm), volumetrischem Skinning und Tennisschläger in der Schlaghand.
- 🏟️ **US Open Court:** Realistische Abmessungen nach offiziellen ITF-Standards (Einzelfeld, Doppelfeld, Aufschlagfelder, Baseline, Netz mit realistischem Durchhang).
- 🎯 **Aufschlag-Mechanik:** Interaktives Aufschlag-Minigame mit Ballwurf und Sweet-Spot Timing-Balken.
- ⚡ **Ballphysik & Rallye:** Schwerkraft, Luftwiderstand, Netzkollision, Doppeldotz- und Aus-Erkennung.
- 🤖 **KI-Gegner:** Reagiert auf Bälle, positioniert sich dynamisch, führt Grundlinienschläge aus und macht realistische Split-Steps.
- 🎾 **Automatische Schlagwahl:** Spieler erkennt Ballposition und führt automatisch Vorhand- oder Rückhandschwünge aus.
- 📊 **Tennis-Zählwerk:** Echte Zählweise (0, 15, 30, 40, Einstand, Vorteil, Spiele, Sätze) mit wechselnder Aufschlagseite.
- 🎥 **Dual-Kamera-System:** Dynamische Follow-Kamera hinter dem Spieler oder freie Orbit-Kamera zur Platzübersicht.
- 📱 **Touch-Steuerung:** Virtueller Stick und großer Schlag-Knopf für Handy und Tablet, inklusive Aufschlag-Timing.

---

## 📁 Projektstruktur

```text
muse-tennis/
├── index.html                      # Spiel (Three.js, Logik, UI, Physik)
├── assets/mascot-bird-rigged.glb   # Geriggter Spieler (Mixamo-Skeleton + Finger)
├── assets/mascot-bird-rig.json     # Knochenkarte / Bind-Metadaten
├── tools/rig_character.py          # CPU-Auto-Rigger (voxel-geodesic heat)
├── mascot bird 3d model.glb        # Ungeriggtes Tripo-Quellmesh
├── .gitignore
└── README.md
```

---

## 🛠️ Lokale Entwicklung

Einfach die Datei `index.html` direkt im Browser per Doppelklick oder über einen lokalen Webserver öffnen (z. B. VS Code Live Server oder `python -m http.server 8000`).

---

## 🔮 Roadmap / Geplante Weiterentwicklung

- [ ] Soundeffekte (Schlaggeräusche, Ballaufprall, Netzkontakt, Schiedsrichteransagen)
- [ ] Sound- und Jubelanimationen für Punkte und Asse
- [ ] Verschiedene Beläge (Sandplatz / Roland Garros, Rasen / Wimbledon)
- [x] Touch-Steuerung für mobile Endgeräte (iOS / Android)
- [ ] Einstellbare KI-Schwierigkeitsgrade (Leicht, Mittel, Profi)
- [ ] Lokaler 2-Spieler-Modus (Split-Screen oder Dual-Controls)
