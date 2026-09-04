# 🎾 Muse Tennis 3D

Ein interaktives 3D-Tennisspiel direkt im Browser, entwickelt mit **Three.js** im authentischen US Open Court-Design. Mit vollständigem Ballwechsel-System, Aufschlag-Mechanik mit Timing-Bar, Ballphysik, automatischer Vorhand-/Rückhand-Auswahl, intelligenter Gegner-KI und offiziellem Tennis-Zählsystem.

## 🚀 Direkt spielen

👉 **[https://markwaldeis.github.io/muse-tennis/](https://markwaldeis.github.io/muse-tennis/)** 👈

*(Keine Installation oder Build-Schritt erforderlich – läuft sofort in jedem modernen Webbrowser!)*

---

## 🎮 Steuerung

| Taste / Aktion | Funktion |
|---|---|
| **W, A, S, D** | Spieler über den Court bewegen |
| **LEERTASTE (Space)** | **Aufschlag:** Ball hochwerfen & im grünen Bereich schlagen<br>**Rallye:** Ball schlagen (Richtung wird durch WASD mitbestimmt) |
| **C** | Kamera wechseln (Follow-Cam an/aus – Orbit-Kamera mit Maus steuerbar) |
| **R** | Ballwechsel / Aufschlag neu starten (Safety Reset) |
| **Linksklick + Ziehen** | Kamera um den Court rotieren (wenn Follow-Cam aus oder ergänzend) |
| **Mausrad** | Zoom |

---

## ✨ Features

- 🏟️ **US Open Court:** Realistische Abmessungen nach offiziellen ITF-Standards (Einzelfeld, Doppelfeld, Aufschlagfelder, Baseline, Netz mit realistischem Durchhang).
- 🎯 **Aufschlag-Mechanik:** Interaktives Aufschlag-Minigame mit Ballwurf und Sweet-Spot Timing-Balken.
- ⚡ **Ballphysik & Rallye:** Schwerkraft, Luftwiderstand, Netzkollision, Doppeldotz- und Aus-Erkennung.
- 🤖 **KI-Gegner:** Reagiert auf Bälle, positioniert sich dynamisch, führt Grundlinienschläge aus und macht realistische Split-Steps.
- 🎾 **Automatische Schlagwahl:** Spieler erkennt Ballposition und führt automatisch Vorhand- oder Rückhandschwünge aus.
- 📊 **Tennis-Zählwerk:** Echte Zählweise (0, 15, 30, 40, Einstand, Vorteil, Spiele, Sätze) mit wechselnder Aufschlagseite.
- 🎥 **Dual-Kamera-System:** Dynamische Follow-Kamera hinter dem Spieler oder freie Orbit-Kamera zur Platzübersicht.

---

## 📁 Projektstruktur

`
muse-tennis/
├── index.html       # Gesamtes Spiel (Three.js WebGL, Spiellogik, UI, Physics)
├── .gitignore       # Git Ignore
└── README.md        # Projektdokumentation & Spiellink
`

---

## 🛠️ Lokale Entwicklung

Einfach die Datei index.html direkt im Browser per Doppelklick oder über einen lokalen Webserver öffnen (z. B. VS Code Live Server oder python -m http.server 8000).

---

## 🔮 Roadmap / Geplante Weiterentwicklung

- [ ] Soundeffekte (Schlaggeräusche, Ballaufprall, Netzkontakt, Schiedsrichteransagen)
- [ ] Sound- und Jubelanimationen für Punkte und Asse
- [ ] Verschiedene Beläge (Sandplatz / Roland Garros, Rasen / Wimbledon)
- [ ] Touch-Steuerung für mobile Endgeräte (iOS / Android)
- [ ] Einstellbare KI-Schwierigkeitsgrade (Leicht, Mittel, Profi)
- [ ] Lokaler 2-Spieler-Modus (Split-Screen oder Dual-Controls)
