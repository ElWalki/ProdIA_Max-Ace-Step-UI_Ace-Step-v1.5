#!/usr/bin/env python3
"""
Reescribir los 58 captions y genres del dataset Continuar.json
para el LoRA Urban_Walki_V3.
Reglas:
  - Máximo 2 frases por caption
  - Vocabulario urbano: reggaeton, perreo, trap, blues, afro-beat, latin
  - Corregir BPMs mal detectados (>150 → /2, <50 → *2)
  - Limpiar genres raros
"""
import json, shutil, os

JSON_PATH = r"D:\espacios de trabajo\vscode\acestep\ACE-Step-1.5_\datasets\Continuar.json"
BACKUP_PATH = JSON_PATH + ".bak_captions"

# ─── CAPTIONS Y GENRES POR FILENAME ───────────────────────────────
# Formato: "filename": ("caption (max 2 frases)", "genre tags", bpm_fix_or_None)

UPDATES = {
    "0.mp3": (
        "A high-energy electronic trap instrumental driven by virtuosic violin melodies with a gypsy-jazz feel over deep sub-bass and crisp modern percussion. Dark cinematic textures with processed vocal samples create dramatic builds and drops.",
        "trap, electronic, violin trap, cinematic, instrumental",
        None  # 91 OK
    ),
    "1.wav": (
        "An explosive Latin reggaeton anthem with aggressive male rap verses, melodic hooks and a punchy drum beat with crunchy electric guitar power chords. Dynamic arrangement featuring boastful flows, sensual melodic bridges and a lively saxophone solo.",
        "reggaeton, Latin urban, aggressive flow, melodic hooks, saxophone",
        None  # 97 OK
    ),
    "11.wav": (
        "An energetic instrumental track built around a catchy twangy electric guitar riff with solid grooving bass and punchy acoustic drums. High-energy upbeat tempo with a retro live-band feel and dynamic instrumental breaks.",
        "surf rock, instrumental, guitar-driven, upbeat, retro",
        None  # 100 OK
    ),
    "13.wav": (
        "An aggressive Spanish hip-hop track with hard-hitting trap production, confrontational lyrical delivery and dark atmospheric beats. Heavy 808 bass and sharp percussive elements drive an intense urban energy.",
        "Spanish trap, aggressive urban rap, dark flow, 808 bass",
        None  # 93 OK
    ),
    "14.wav": (
        "A mid-tempo Latin pop track with a steady reggaeton-lite drum machine groove and smooth melodic vocal hooks. Clean production with warm synth pads and a danceable rhythmic foundation.",
        "Latin pop, reggaeton, melodic, danceable, smooth",
        None  # 99 OK
    ),
    "15.flac": (
        "An energetic Latin tech-house track with a punchy four-on-the-floor beat and quirky electronic melodic elements. Vibrant production blending urban Latin rhythms with electronic dance energy.",
        "Latin tech-house, electronic, urban dance, energetic",
        None  # 97 OK
    ),
    "16.mp3": (
        "A quirky psychedelic perreo track with jangly electric guitar riffs, steady drum machine rhythms and aggressive male vocal flow. Sensual female backing vocals add contrast over a hypnotic bass-driven groove.",
        "perreo, psychedelic flow, aggressive reggaeton, sensual female vocals",
        None  # 110 OK
    ),
    "17.wav": (
        "A warm afro-beat track opening with clean arpeggiated electric guitar and light delay effects over a flowing organic rhythm section. Sensual female vocals glide over layered percussion and lush harmonic textures.",
        "afro-beat, sensual female vocals, organic percussion, guitar-driven",
        None  # 115 OK
    ),
    "18.flac": (
        "An aggressive old school reggaeton track with sharp synth brass stabs, heavy dembow beat and iconic throwback energy. Hard-hitting production reminiscent of classic 2000s reggaeton with commanding vocal delivery.",
        "old school reggaeton, aggressive, classic dembow, brass stabs, iconic",
        None  # 97 OK
    ),
    "19.wav": (
        "An energetic urban rap track with punchy drums, deep resonant 808 bass and aggressive vocal delivery. Sensual female vocal hooks contrast with hard-hitting gang rap verses over a dark atmospheric beat.",
        "urban rap, sensual female vocals, aggressive flow, 808 bass, gang rap",
        None  # 94 OK
    ),
    "2.mp3": (
        "A Latin pop flamenco instrumental blending passionate nylon-string guitar with sub-bass synthesizer and a sensual danceable groove. Warm organic tones meet modern urban production in a smooth rhythmic arrangement.",
        "latin flamenco, nylon guitar, sub bass, sensual groove, latin pop, instrumental",
        None  # 110 OK
    ),
    "20.wav": (
        "A melancholic romantic trap blues track built on warm overdriven electric guitar over deep 808 bass and hybrid organic-electronic drums. Bittersweet emotional atmosphere with a raw bluesy feel and modern trap production.",
        "trap blues, romantic trap, melancholic, overdriven guitar, 808 bass, hybrid drums",
        None  # 100 OK
    ),
    "21.flac": (
        "A comedic old school reggaeton track with bouncy dembow beat, punchy bass and boastful male vocals with party energy. Playful throwback production with classic Latin party vibes and catchy hooks.",
        "old school reggaeton, comedic perreo, party reggaeton, dembow, boastful vocals",
        None  # 96 OK
    ),
    "22.mp3": (
        "A futuristic reggaeton track with a classic punchy dembow drum machine beat and modern electronic production elements. Clean energetic arrangement blending traditional reggaeton rhythms with forward-thinking sound design.",
        "futuristic reggaeton, modern reggaeton, dembow, electronic",
        None  # 92 OK
    ),
    "23.wav": (
        "A romantic trap blues track driven by warm overdriven electric guitar melody, deep 808 bass and crisp trap hi-hats. Breathy languid female vocals deliver a sultry performance shifting between melancholic softness and emotional intensity.",
        "romantic trap, trap blues, breathy female vocals, overdriven guitar, 808 bass, melancholic, bittersweet",
        None  # 78 OK
    ),
    "24.flac": (
        "An aggressive high-energy old school reggaeton track with hard-hitting dembow drums, powerful bass and raw vocal delivery. Classic 2000s production with intense rhythmic drive and commanding flow.",
        "old school reggaeton, aggressive, classic dembow, high-energy, raw vocals",
        None  # 100 OK
    ),
    "25.mp3": (
        "An energetic dark perreo instrumental with rapidly tremolo-picked melodies over a driving dembow beat. Intense atmospheric production with deep bass and aggressive percussive elements.",
        "dark perreo, dembow, instrumental, aggressive, tremolo",
        None  # 98 OK
    ),
    "26.wav": (
        "A clean nylon-string acoustic guitar opens with a flamenco-inspired arpeggio pattern in an intimate emotional arrangement. Warm organic tones with delicate melodic phrasing and a sparse atmospheric backdrop.",
        "acoustic ballad, flamenco-inspired, nylon guitar, emotional, intimate",
        80  # 80 OK already actually
    ),
    "27.flac": (
        "A smooth romantic Latin pop track with a steady reggaeton-style drum machine groove and warm melodic vocal hooks. Clean production with lush harmonic textures and a gentle danceable rhythm.",
        "Latin pop, romantic reggaeton, smooth, melodic, danceable",
        None  # 100 OK
    ),
    "28.mp3": (
        "An energetic quirky instrumental piece driven by staccato ragtime-influenced patterns and bright rhythmic guitar. Upbeat playful arrangement with punchy drums and a retro-flavored production style.",
        "quirky instrumental, surf rock, retro, upbeat, staccato",
        75  # 150 → 75
    ),
    "29.wav": (
        "A driving mid-tempo Latin electronic track with a prominent beat and atmospheric synth textures. Urban rhythmic foundation blending electronic production with Latin melodic sensibility.",
        "Latin electronic, urban, atmospheric, mid-tempo, synth-driven",
        None  # 100 OK
    ),
    "3.flac": (
        "An energetic bilingual Latin pop track with a driving reggaeton-style dembow beat and catchy vocal hooks. Dynamic production with modern urban elements and a danceable rhythmic groove.",
        "Latin pop, reggaeton, bilingual, dembow, danceable, energetic",
        None  # 100 OK
    ),
    "30.flac": (
        "A track opening with a melancholic atmospheric intro featuring clean electric guitar over lush pads. Emotional Latin pop-rock arrangement building from intimate verses to powerful dynamic sections.",
        "Latin pop-rock, emotional, atmospheric, guitar-driven, melancholic",
        None  # 100 OK
    ),
    "33.flac": (
        "A smooth mid-tempo reggaeton track with strong R&B and funk influences blending warm vocal harmonies with rhythmic dembow patterns. Sensual groove with polished production and soulful melodic elements.",
        "reggaeton R&B, sensual, smooth, funk-influenced, soulful",
        100  # 300 → 100
    ),
    "36.flac": (
        "A dreamy atmospheric reggaeton track opening with filtered synth pads and a watery textured intro. Hypnotic production with floating melodies over a steady dembow rhythm and deep bass.",
        "dreamy reggaeton, atmospheric, synth-driven, hypnotic, dembow",
        100  # 200 → 100
    ),
    "4.flac": (
        "A classic boom-bap hip-hop track with a steady drum machine groove and deep jazzy sample-based production. Head-nodding beat with crispy drums, warm bass and raw vocal delivery.",
        "boom-bap hip-hop, classic, sample-based, jazzy, raw vocals",
        100  # 300 → 100
    ),
    "41.wav": (
        "A catchy Latin urban track with clean slightly chorused electric guitar playing an arpeggiated riff over a modern beat. Polished production blending melodic guitar hooks with urban rhythmic elements.",
        "Latin urban, guitar-driven, melodic, modern, arpeggiated",
        103  # 205 → 103
    ),
    "42.flac": (
        "An atmospheric synth pad opens into a melancholic Latin pop track driven by a crisp reggaeton-influenced beat. Emotional vocal delivery over lush harmonic textures with bittersweet melodic hooks.",
        "Latin pop, reggaeton, melancholic, atmospheric, bittersweet",
        74  # 37 → 74
    ),
    "43.mp3": (
        "An energetic funky instrumental track driven by tight syncopated drum machine patterns and groovy bass. Playful cabaret-inspired arrangement with bold horn stabs and rhythmic guitar scratches.",
        "funk, cabaret, instrumental, groovy, syncopated, horns",
        80  # 40 → 80
    ),
    "44.wav": (
        "A comedic Latin hip-hop track built on a steady mid-tempo reggaeton beat with playful vocal delivery. Light-hearted production with bouncy drums and catchy melodic hooks.",
        "Latin hip-hop, comedic, reggaeton beat, playful, bouncy",
        None  # 78 OK
    ),
    "45.flac": (
        "A heartfelt Spanish pop-rap track built on clean piano chords and emotional melodic vocal delivery. Intimate production blending rap verses with singing hooks over a gentle rhythmic foundation.",
        "Spanish pop-rap, emotional, piano-driven, heartfelt, intimate",
        80  # 40 → 80
    ),
    "46.mp3": (
        "An aggressive high-energy track driven by relentless distorted kick drums and intense industrial textures. Dark heavy production with pounding bass and hard-hitting percussive elements.",
        "hardstyle, aggressive, industrial, heavy bass, distorted kicks",
        102  # 51 → 102
    ),
    "51.mp3": (
        "An upbeat celebratory Arabic pop track with strong dancehall-reggaeton influences and festive percussive energy. Vibrant rhythmic production with catchy melodic hooks and a party atmosphere.",
        "Arabic pop, dancehall, reggaeton, celebratory, festive",
        None  # 90 OK
    ),
    "52.wav": (
        "A melancholic Latin trap track with deep resonant 808 bass, atmospheric synth pads and emotional vocal delivery. Dark moody production with slow trap rhythms and haunting melodic textures.",
        "Latin trap, melancholic, 808 bass, atmospheric, dark, moody",
        100  # 300 → 100
    ),
    "53.flac": (
        "A modern Latin pop track with strong reggaeton influences built around clean melodic production and danceable rhythms. Smooth vocal hooks over crisp dembow-inspired beats and warm harmonic textures.",
        "Latin pop, reggaeton, modern, melodic, danceable, dembow",
        None  # 80 OK
    ),
    "54.mp3": (
        "A raw lo-fi indie rock track with simple strummed acoustic guitar and gritty distorted textures. Unpolished garage-style production with an intimate bedroom recording atmosphere.",
        "lo-fi indie rock, raw, acoustic, garage, gritty",
        None  # 80 OK
    ),
    "55.wav": (
        "A Latin pop reggaeton track opening with a distorted radio transmission sample before transitioning into a polished modern beat. Smooth vocal delivery over crisp reggaeton rhythms and atmospheric synth production.",
        "Latin pop reggaeton, modern, atmospheric, polished, radio effect",
        None  # 84 OK
    ),
    "56.mp3": (
        "An upbeat celebratory Latin pop track driven by a vibrant rhythm section with warm melodic arrangements. Joyful production with catchy hooks and a feel-good danceable energy.",
        "Latin pop, celebratory, upbeat, vibrant, danceable, joyful",
        None  # 70 OK
    ),
    "57.wav": (
        "A melancholic Latin pop track with a steady mid-tempo reggaeton beat and emotional vocal performance. Bittersweet melodic hooks over atmospheric production with subtle electronic textures.",
        "Latin pop reggaeton, melancholic, emotional, atmospheric, bittersweet",
        70  # 140 → 70
    ),
    "6.wav": (
        "An intense cinematic intro with dramatic synth strings and powerful percussive elements building into a driving electronic beat. Dark atmospheric textures with sweeping pads and aggressive rhythmic energy.",
        "electronic, cinematic, dark atmospheric, synth-driven, dramatic",
        None  # 100 OK
    ),
    "61.mp3": (
        "A dreamy atmospheric track opening with shimmering synth pads and gentle piano melody over a smooth groove. Warm R&B-influenced production with lush harmonies and a sultry relaxed atmosphere.",
        "pop R&B, dreamy, atmospheric, smooth, piano, sultry",
        None  # 100 OK
    ),
    "62.wav": (
        "An intense cinematic track with dramatic staccato orchestral strings and impactful percussive elements. Dark industrial hip-hop production with heavy atmospheric textures and aggressive sonic design.",
        "industrial hip-hop, cinematic, dark, orchestral, aggressive",
        80  # 40 → 80
    ),
    "63.mp3": (
        "An explosive high-energy funk and jungle fusion instrumental driven by tight breakbeats and thick groovy bass. Wild dynamic arrangement with bold horn stabs and relentless percussive energy.",
        "funk, jungle, instrumental, high-energy, breakbeat, horns",
        100  # 200 → 100
    ),
    "64.mp3": (
        "An upbeat playful instrumental jingle driven by a lively accordion melody and bouncy rhythmic accompaniment. Short cheerful arrangement with folk-inspired instrumentation and festive energy.",
        "folk, accordion, playful, jingle, upbeat, festive",
        94  # 188 → 94
    ),
    "65.flac": (
        "A bilingual hip-hop track with a steady head-nodding boom-bap drum loop and deep sample-based production. Classic hip-hop feel with warm bass, crispy drums and confident vocal delivery.",
        "boom-bap hip-hop, bilingual, classic, sample-based, confident",
        None  # 100 OK
    ),
    "67.flac": (
        "A smooth groovy Brazilian funk track with clean melodic electric guitar and a bouncy percussive rhythm section. Warm organic production blending Latin grooves with funky bass lines and rich harmonic textures.",
        "Brazilian funk, groovy, guitar-driven, melodic, organic",
        None  # 109 OK
    ),
    "68.flac": (
        "A clean melodic track opening with electric guitar riff and organic rhythmic accompaniment in a laid-back reggae-pop style. Warm tones with steady offbeat rhythms and catchy vocal hooks.",
        "reggae-pop, melodic, laid-back, guitar-driven, warm, offbeat",
        None  # 100 OK
    ),
    "69.flac": (
        "An upbeat romantic reggaeton track with a classic dembow drum machine beat and smooth melodic hooks. Warm production with lush synth pads and heartfelt vocal delivery over a danceable groove.",
        "reggaeton, romantic, dembow, upbeat, smooth, heartfelt",
        100  # 300 → 100
    ),
    "7.flac": (
        "An upbeat bilingual Latin pop track with a steady reggaeton-style drum machine groove and catchy melodic hooks. Polished modern production with warm harmonic textures and energetic vocal delivery.",
        "Latin pop reggaeton, bilingual, upbeat, modern, polished",
        72  # 36 → 72
    ),
    "70.flac": (
        "An energetic comedic Latin pop-rock track with punchy drum machine beats and lively vocal performance. Dynamic arrangement with playful energy, bold guitar riffs and catchy anthemic hooks.",
        "Latin pop-rock, comedic, energetic, anthemic, playful, guitar",
        70  # 140 → 70
    ),
    "71.wav": (
        "An energetic confrontational Latin pop-rap diss track with a driving reggaeton beat and aggressive vocal delivery. Bold lyrical flow over hard-hitting drums with deep bass and sharp percussive accents.",
        "reggaeton pop-rap, aggressive, diss track, driving, bold flow",
        None  # 86 OK
    ),
    "72.wav": (
        "An energetic celebratory Spanish pop-rap track with a driving reggaeton beat and confident boastful delivery. Upbeat production with catchy hooks, punchy drums and a party atmosphere.",
        "reggaeton pop-rap, celebratory, upbeat, party, boastful",
        None  # 99 OK
    ),
    "73.wav": (
        "A clean arpeggiated electric guitar with light delay opens into an anthemic track with building emotional intensity. Uplifting arrangement with soaring melodic lines and a powerful dynamic progression.",
        "anthem, uplifting, guitar-driven, emotional, epic, arpeggiated",
        100  # 300 → 100
    ),
    "74.wav": (
        "A modern reggaeton track with a classic punchy dembow drum machine beat and deep bass foundation. Clean polished production with melodic vocal hooks and rhythmic energy.",
        "reggaeton, modern, dembow, punchy, melodic, polished",
        None  # 90 OK
    ),
    "75.wav": (
        "A bilingual pop birthday song with heavy trap-influenced beat and celebratory energy. Modern production blending pop melodies with trap bass and uplifting vocal harmonies.",
        "pop, trap, celebratory, bilingual, upbeat, birthday anthem",
        100  # 199 → 100
    ),
    "8.mp3": (
        "A modern regional Mexican track blending traditional sierreño elements with urban production and dramatic brass arrangements. Bold horn melodies over punchy drums with a fusion of folk and contemporary urban style.",
        "regional Mexican, urban fusion, brass, sierreño, dramatic",
        99  # 198 → 99
    ),
    "9.wav": (
        "A Latin pop-rock track erupting from a filtered lo-fi vocal sample into a high-energy full-band arrangement. Punchy drums with distorted guitar riffs and energetic vocal delivery in a dynamic rock-meets-urban style.",
        "Latin pop-rock, high-energy, guitar-driven, dynamic, distorted",
        None  # 100 OK
    ),
    "a.flac": (
        "A gritty lo-fi Latin trap track built on a distinctive looping saxophone sample with deep bass and dusty drums. Raw atmospheric production with a moody jazz-infused sound and urban trap rhythms.",
        "lo-fi Latin trap, saxophone, gritty, moody, jazz-infused, raw",
        None  # 80 OK
    ),
}

def main():
    # Backup
    if not os.path.exists(BACKUP_PATH):
        shutil.copy2(JSON_PATH, BACKUP_PATH)
        print(f"✅ Backup: {BACKUP_PATH}")
    else:
        print(f"ℹ️  Backup ya existe: {BACKUP_PATH}")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    bpm_fixed = 0
    not_found = []

    for sample in data["samples"]:
        fname = sample["filename"]
        if fname in UPDATES:
            caption, genre, bpm_fix = UPDATES[fname]
            sample["caption"] = caption
            sample["genre"] = genre
            if bpm_fix is not None:
                old_bpm = sample["bpm"]
                sample["bpm"] = bpm_fix
                print(f"  🔧 BPM {fname}: {old_bpm} → {bpm_fix}")
                bpm_fixed += 1
            updated += 1
        else:
            not_found.append(fname)

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"✅ {updated}/58 captions + genres actualizados")
    print(f"🔧 {bpm_fixed} BPMs corregidos")
    if not_found:
        print(f"⚠️  No encontrados en UPDATES: {not_found}")
    print(f"📁 Guardado: {JSON_PATH}")

if __name__ == "__main__":
    main()
