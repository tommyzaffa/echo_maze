# Echo Maze - Report per generazione sprite e fondali M12

Questo documento serve come brief completo da dare a ChatGPT / generatore immagini per produrre asset visivi del gioco in modo ordinato, a milestone, senza chiedere 50 sprite in un unico prompt.

Il gioco e un action-platform roguelite/metroidvania 2D in canvas. La stanza logica misura `640x360 px`. Il mondo e un labirinto underground proceduralmente generato: periferia sotterranea di una citta cyberpunk, piena di venditori strani, criminali, robot di pattuglia, cloni del giocatore e boss nascosti nei vicoli ciechi.

L'obiettivo artistico e: **suggestivo, misterioso, iconico, cyberpunk underground + Hollow Knight-like**, ma sempre leggibile in gameplay. Non deve sembrare pixel art/8-bit. Deve sembrare illustrato, fluido, con silhouette forti, colori neon controllati, personaggi chiari e animazioni leggibili.

---

## 1. Direzione Artistica

### Mood

- Underground cyberpunk, periferia decadente sotto la citta.
- Atmosfera misteriosa, malinconica, affascinante.
- Influenze visive:
  - Hollow Knight: silhouette eleganti, personaggi iconici, occhi/volti semplici, atmosfera oscura e poetica.
  - Cyberpunk: neon, cavi, insegne rotte, tecnologia sporca, giacche, maschere, visori, robot, protesi.
  - Urban fantasy: mercanti eccentrici, strumenti musicali come armi, boss teatrali.

### Cosa evitare

- Evitare pixel art pura, sprite 8-bit, cubetti, bordi scalettati.
- Evitare stile troppo realistico/fotografico.
- Evitare troppi dettagli minuscoli impossibili da leggere a 24-44 px.
- Evitare look fantasy medievale classico.
- Evitare personaggi animaletti: i nemici normali devono sembrare persone, criminali, androidi o agenti robotici.
- Evitare fondali troppo luminosi che confondono piattaforme, porte, pickup e nemici.

### Palette base

Sfondo e materiali:

- Nero bluastro: `#05070d`
- Blu notte: `#171927`
- Viola-grigio pareti: `#38394f`
- Metallo freddo: `#68749a`
- Verde muffa/tossico: `#345f4d`

Accenti neon:

- Ciano porta/energia: `#7af0ff`
- Oro/ambra: `#ffd166`
- Rosa criminale/boss: `#ff5c7a`
- Verde chimico: `#66f0a6`
- Viola mistico: `#d985ff`

Regola importante: gli asset devono poter essere letti su sfondo scuro. Usare contorni/scuri interni e piccoli rim light neon, non riempire tutto di luce.

---

## 2. Specifiche Tecniche Generali

### Coordinate di gioco

- Stanza logica: `640x360 px`.
- Spessore pareti/pavimento/soffitto: `16 px`.
- Uscita Nord/Sud: apertura larga `56 px`.
- Uscita Est/Ovest: apertura alta `64 px`.
- La camera viene scalata dal canvas, quindi gli sprite devono essere leggibili anche piccoli.

### Formato asset consigliato

Per ogni sprite/sheet:

- Formato: `PNG` con trasparenza.
- Background: completamente trasparente.
- Nessuna ombra proiettata enorme dentro lo sprite, salvo piccola contact shadow opzionale separata.
- Nessun testo dentro gli sprite, salvo icone UI.
- Ogni frame deve avere stessa dimensione cella.
- Il personaggio deve rimanere centrato nella cella.
- Usare padding trasparente coerente, non crop automatico.
- Orientamento base: personaggio rivolto a destra. Il gioco puo mirrorare verso sinistra.

### Regola importante su dimensioni e scala artistica

Non bloccare la creativita del generatore sulle dimensioni attuali di player, NPC, nemici, boss o checkpoint. Le hitbox attuali erano nate da placeholder piccoli e semplici, quindi non devono vincolare l'art direction.

Regola:

- Per **personaggi, NPC, nemici, boss, cloni, checkpoint e oggetti iconici**, lasciare liberta di silhouette, proporzioni e ingombro visivo.
- Il generatore deve scegliere forme piu naturali, leggibili e affascinanti.
- Dopo la generazione, il gioco verra adattato: ridimensioneremo gli sprite, cambieremo hitbox, offset, anchor e collisioni se necessario.
- L'unico vincolo e che ogni animazione abbia frame coerenti, trasparenza e un anchor logico.
- Le dimensioni tecniche precise restano obbligatorie solo per fondali, canvas, piattaforme, porte, tiles, UI e FX che devono combaciare con la stanza.

I generatori immagini spesso rovinano dettagli a dimensioni troppo piccole. Generare quindi gli asset in **alta risoluzione coerente**, poi esportare/downscalare.

Suggerimento pipeline:

1. Generare sprite sheet a `4x` o `8x`.
2. Mantenere cella coerente.
3. Downscalare in modo controllato.
4. Importare nel gioco usando `drawImage`.

Per personaggi e boss:

- Non chiedere "deve stare in 24x36" o "deve stare in 56x56".
- Chiedere invece: "same frame size, generous transparent padding, full body visible, feet aligned, readable silhouette".
- Dopo aver scelto lo stile, stabiliremo una scala finale in gioco.

### Ancore

Ogni sprite deve avere un anchor chiaro:

- `anchorX`: centro piedi.
- `anchorY`: punto a terra sotto i piedi.
- Per personaggi volanti: anchor al centro del corpo oppure al centro dell'hover rig.
- Il corpo puo essere piu alto/largo degli attuali placeholder.
- Armi, cappucci, cappotti e accessori possono estendersi liberamente, pur restando dentro la cella trasparente.
- Per checkpoint/oggetti a terra: anchor al centro della base.

### Convenzioni nomi

Usare nomi file coerenti:

```text
player_idle.png
player_walk.png
player_jump.png
player_fall.png
player_crouch.png
player_attack_side.png
player_attack_up.png
player_attack_down.png
enemy_walker_idle.png
npc_healer_idle.png
boss_warden_idle.png
bg_room_wall_tiles.png
```

Per sprite sheet:

```text
player_idle_6f.png
```

Dove:

- `6f` = 6 frame.
- Se in futuro scegliamo una dimensione finale precisa, potremo aggiungerla al nome file dopo l'import.

---

## 3. Scala Artistica vs Hitbox di Gameplay

Queste note non sono vincoli per il generatore. Servono solo a ricordare che il gioco oggi usa placeholder piccoli. Gli asset nuovi possono essere piu grandi, piu umani e piu espressivi.

Workflow corretto:

1. Generare prima immagini belle, coerenti e leggibili.
2. Scegliere scala visiva dentro il gioco.
3. Aggiornare hitbox/offset/collisioni in base agli asset.
4. Testare leggibilita e gameplay.

### Player

- Deve essere libero di avere proporzioni piu umane/stilizzate.
- Deve comunicare cappuccio + chitarra + agilita.
- Deve essere molto piu iconico dei placeholder attuali.
- L'accucciata deve essere visivamente chiara, ma non serve rispettare ora una misura precisa.

### Nemici normali

- Devono essere piu simili a persone, criminali, androidi, pattuglie robotiche.
- Possono essere piu alti dei placeholder attuali.
- La scala puo variare per ruolo: walker piu snello, charger piu massiccio, shooter con arma evidente, flyer con jetpack o hover rig.
- Il clone puo essere simile al player, ma distorto e minaccioso.

### Miniboss

- I boss devono avere liberta totale di silhouette.
- Possono essere larghi, alti, fluttuanti, deformi, meccanici, teatrali.
- L'importante e che ciascun boss sia distinguibile immediatamente.
- La hitbox verra adattata boss per boss.

### NPC

- Devono stare al suolo, non fluttuare.
- Devono sembrare veri personaggi/vendor dell'underground, non icone.
- Possono essere piu grandi o piu strani dei placeholder.
- Ogni NPC deve avere prop chiaro: borsa medica, cavi mistici, gadget, saldatore, valigia regalo.

### Checkpoint

- Non deve essere per forza un rettangolo/cristallo.
- Puo diventare un "falo" cyberpunk: piccolo braciere, falò elettrico, amplificatore spento, lanterna a terra, antenna rituale.
- Quando inattivo deve sembrare spento/freddo.
- Quando attivato puo accendersi con fuoco neon/ciano o fiamma elettrica.
- Deve avere una base a terra e un anchor chiaro.

### Pickup

- Devono essere piccoli e leggibili, ma non serve bloccare una misura ora.
- Le monete possono avere dimensioni visive diverse in base al valore.
- Pickup vita/abilita/consumabili possono essere piu iconici se serve.
- Dopo la generazione scaleremo ogni pickup in gioco.

### Proiettili / FX

- Proiettile nemico e ranged player devono essere piccoli e chiari.
- La super arma deve essere molto piu leggibile e spettacolare.
- Stop/slow/shield sono FX circolari o overlay.

### Ambiente

- Stanza: `640x360`.
- Pareti: `16 px`.
- Piattaforme: altezza tipica `10-14 px`, lunghezza variabile.
- Mini piattaforma consumabile: `74x10`.
- Porte:
  - Nord/Sud: gap largo `56`.
  - Est/Ovest: gap alto `64`.

---

## 4. Regole Generali per ChatGPT/Generatore Immagini

Ogni prompt deve includere:

```text
Create a clean 2D game sprite sheet for a dark cyberpunk underground platformer.
Style: fluid hand-painted / clean illustrated 2D, mysterious and iconic, Hollow Knight-like mood mixed with neon cyberpunk.
Transparent background. No pixel art. No 8-bit look. No text. No watermark.
Consistent character design across all frames.
Character facing right.
Same canvas size for every frame.
Keep feet aligned to the same baseline.
Strong readable silhouette at small size.
Use dark body shapes with controlled neon accents.
```

Prompt negativo:

```text
Avoid pixel art, 8-bit sprites, realistic photo style, over-detailed armor, medieval fantasy, cute animals, busy background, cropped limbs, inconsistent frame sizes, inconsistent costume, different character in each frame, text, watermark, UI labels.
```

Se il generatore non supporta vera trasparenza, chiedere sfondo chroma key:

```text
Use a perfectly flat solid #00ff00 chroma-key background, with no shadows or gradients on the background. Do not use #00ff00 anywhere in the sprite.
```

---

## 5. Milestone di Generazione Asset

Non generare tutto insieme. Procedere cosi:

1. M12-A: Style Bible + Player base.
2. M12-B: Player animazioni gameplay.
3. M12-C: NPC e vendor.
4. M12-D: Nemici normali e clone.
5. M12-E: Proiettili, pickup, consumabili, abilita.
6. M12-F: Ambiente, piattaforme, porte, fondali, checkpoint.
7. M12-G: Boss batch 1.
8. M12-H: Boss batch 2.
9. M12-I: Boss batch 3.
10. M12-J: Boss batch 4.
11. M12-K: Boss batch 5.
12. M12-L: Boss batch 6 + polish UI.

Ogni milestone deve produrre pochi asset molto coerenti. Dopo ogni milestone, verificare in gioco e correggere.

---

# M12-A - Style Bible + Player Base

## Obiettivo

Creare il protagonista iconico e la direzione visiva definitiva.

## Personaggio principale

Concept:

- Giovane figura incappucciata, misteriosa, agile.
- Vive nella periferia underground cyberpunk.
- Combatte usando una chitarra elettrica/strumento ibrido come arma.
- Non deve sembrare un cavaliere con spada.
- La chitarra deve essere riconoscibile anche piccola: corpo tondeggiante, manico sottile, accento neon.
- Outfit: cappuccio, cappotto corto o mantello leggero, stivali, piccole luci neon, volto quasi nascosto.
- Volto: non dettagli realistici; usare visore/occhi luminosi sottili.
- Silhouette chiara: cappuccio + chitarra = identita.

Palette:

- Corpo/cappotto: blu notte, grigio chiaro spento.
- Accenti: ciano + ambra.
- Volto/visor: nero profondo con linea luminosa.

Sprite richiesti in M12-A:

1. `player_concept_front.png`
2. `player_concept_side.png`
3. `player_idle_test_sheet_4f.png`

Specifiche `player_idle_test_sheet_4f`:

- 4 frame.
- Ogni frame deve avere la stessa cella trasparente.
- Lasciare al generatore liberta sulla dimensione della cella e sulla scala del personaggio.
- Personaggio rivolto a destra.
- Piedi sulla stessa baseline.
- Corpo intero visibile, con padding sufficiente.
- Chitarra visibile in idle, appesa o tenuta davanti al corpo.
- Animazione idle: respirazione minima, cappuccio e cappotto appena mossi.

Prompt M12-A:

```text
Create a 4-frame 2D game sprite sheet for the main character of a dark cyberpunk underground platformer.
Character: a mysterious hooded young guitarist-warrior from the underground outskirts of a neon city. The character uses an electric guitar as a melee weapon. Hollow Knight-like elegance mixed with cyberpunk street style.
Style: fluid hand-painted 2D, clean illustrated shapes, no pixel art, strong silhouette, iconic and readable at small size.
Outfit: hood, short cloak/coat, boots, hidden face with a thin cyan visor line, small amber neon accents, electric guitar visible in idle.
Canvas: 4 frames, each frame same size, generous transparent padding, no fixed pixel size required. Transparent background. Character facing right. Feet aligned to same baseline. Full body visible. No text, no watermark.
Animation: subtle idle breathing, coat barely moving, guitar held consistently.
```

---

# M12-B - Player Animazioni Gameplay

## Sprite sheet player completi

Non fissare dimensione finale ora. Chiedere sprite sheet con cella coerente, padding trasparente e proporzioni libere. Dopo il concept sceglieremo scala e hitbox nel codice.

Lista animazioni:

1. `player_idle_6f.png`
   - 6 frame.
   - Respiro, cappuccio, mano sulla chitarra.

2. `player_walk_8f.png`
   - 8 frame.
   - Camminata agile, cappotto che segue.
   - Chitarra resta leggibile ma non ingombra.

3. `player_run_8f.png`
   - 8 frame.
   - Piu inclinato in avanti, cappotto piu dinamico.

4. `player_jump_start_3f.png`
   - 3 frame.
   - Compressione e stacco.

5. `player_jump_loop_2f.png`
   - 2 frame.
   - Corpo in aria, gambe raccolte.

6. `player_fall_2f.png`
   - 2 frame.
   - Mantello e chitarra sollevati dal vento.

7. `player_land_3f.png`
   - 3 frame.
   - Impatto leggero sul terreno.

8. `player_crouch_3f.png`
   - 3 frame.
   - Passaggio in accucciata.
   - Deve essere chiaramente piu basso della posa in piedi.

9. `player_crouch_idle_4f.png`
   - 4 frame.
   - Rimane accucciato.

10. `player_dash_5f.png`
    - 5 frame.
    - Scatto laterale, scia ciano.

11. `player_wall_slide_4f.png`
    - 4 frame.
    - Mano/piede contro parete.

12. `player_wall_jump_4f.png`
    - 4 frame.
    - Spinta dalla parete.

13. `player_hurt_3f.png`
    - 3 frame.
    - Colpo subito, flash chiaro.

14. `player_death_8f.png`
    - 8 frame.
    - Crollo/disgregazione in echi neon.

## Attacchi chitarra

L'arma default non e una spada: e una chitarra usata come arma corpo a corpo.

1. `player_attack_side_6f.png`
   - Cella piu larga solo se artisticamente serve per contenere swing laterale.
   - Personaggio a sinistra della cella, attacco verso destra.
   - La chitarra deve lasciare una scia ciano/ambra.
   - La hitbox gameplay verra decisa dopo import.

2. `player_attack_up_5f.png`
   - Attacco verso l'alto.
   - Chitarra sollevata/swing verticale.

3. `player_attack_down_5f.png`
   - Attacco verso il basso in aria.
   - Deve comunicare rimbalzo se colpisce.

4. `player_ground_slam_8f.png`
   - Schianto a terra.
   - Chitarra o amplificatore energetico batte sul suolo.
   - Frame finali con onda circolare/crepe neon.

5. `player_super_hadoken_8f.png`
   - Super arma su Space.
   - Grossa onda sonora/energia emessa dalla chitarra.
   - Deve sembrare un colpo musicale, non una semplice palla.

Prompt base M12-B:

```text
Create a complete 2D sprite sheet animation for the established hooded guitarist-warrior character.
Maintain exactly the same character design from the reference: hood, hidden face, cyan visor, short cloak/coat, boots, electric guitar weapon, cyberpunk underground mood.
Style: fluid illustrated 2D, Hollow Knight-like mysterious silhouette mixed with neon cyberpunk. No pixel art.
Transparent background, same cell size for every frame, generous transparent padding, feet aligned to the same baseline when grounded, character facing right. No fixed pixel dimensions required.
Animation requested: [INSERT ANIMATION NAME AND FRAME COUNT].
The guitar must remain recognizable and consistent.
No text, no watermark, no background.
```

---

# M12-C - NPC e Vendor

## Obiettivo

Rendere gli NPC chiaramente personaggi e non marker. Devono stare al suolo. Devono sembrare venditori/abitanti eccentrici dell'underground, non eroi fantasy generici.

Regole NPC:

- Nessuna dimensione finale fissa.
- Ogni NPC idle: 4-6 frame.
- Ogni NPC deve avere silhouette unica.
- Devono stare chiaramente a terra.
- Lasciare liberta su altezza, cappotto, oggetti, zaini, cavi, valigie e posture.
- Dopo la generazione, scaleremo ogni NPC in gioco e adatteremo area di interazione/offset.

## NPC richiesti

### 1. Healer / Guaritore

Ruolo: vende vite e cibo.

Concept:

- Medico da strada, cyberpunk, gentile ma inquietante.
- Porta una borsa medica luminosa o contenitore bio-neon.
- Maschera chirurgica o visore.
- Colori: verde chimico + bianco sporco.

File:

- `npc_healer_idle_6f.png`
- `npc_healer_interact_4f.png`
- `npc_healer_shop_portrait.png`

### 2. Mystic / Mistico

Ruolo: vende abilita.

Concept:

- Hacker-sciamano, mantello lungo, ologrammi e cavi.
- Non mago medievale: deve sembrare tecnologia mistica.
- Colori: viola + ciano.

File:

- `npc_mystic_idle_6f.png`
- `npc_mystic_interact_4f.png`
- `npc_mystic_shop_portrait.png`

### 3. Armorer / Venditore consumabili

Ruolo: consumabili.

Concept:

- Contrabbandiere con giacca piena di gadget.
- Piccoli droni/pacchetti agganciati al corpo.
- Colori: ciano + grigio metallo.

File:

- `npc_armorer_idle_6f.png`
- `npc_armorer_interact_4f.png`
- `npc_armorer_shop_portrait.png`

### 4. Blacksmith / Fabbro upgrade armi

Ruolo: upgrade arma default e super arma.

Concept:

- Tecnico underground, saldatore, liutaio di armi musicali.
- Deve sembrare capace di potenziare una chitarra-arma.
- Porta strumenti, cavi, piccola incudine/saldatore.
- Colori: ambra + arancio + metallo scuro.

File:

- `npc_blacksmith_idle_6f.png`
- `npc_blacksmith_interact_4f.png`
- `npc_blacksmith_shop_portrait.png`

### 5. Benefactor / NPC regalo

Ruolo: appare e regala consumabili/abilita/cibo.

Concept:

- Figura misteriosa, elegante, non shopkeeper.
- Cappotto bianco/sporco, aureola neon rotta, valigia luminosa.
- Deve sembrare amichevole ma enigmatico.
- Colori: bianco spento + oro + ciano.

File:

- `npc_benefactor_idle_6f.png`
- `npc_benefactor_gift_6f.png`
- `npc_benefactor_portrait.png`

Prompt M12-C:

```text
Create a 2D game NPC sprite sheet for a cyberpunk underground platformer.
Style: mysterious Hollow Knight-like silhouette mixed with neon cyberpunk street vendor design. Fluid illustrated 2D, no pixel art.
NPC: [INSERT NPC ROLE AND CONCEPT].
Canvas: no fixed pixel size required, 6 frames, same frame size, generous transparent padding, transparent background, feet aligned to same baseline, standing on ground, facing slightly right.
The NPC must clearly read as a person/vendor, with a unique silhouette and readable prop.
No text, no watermark, no background.
```

---

# M12-D - Nemici Normali e Clone

## Obiettivo

I nemici normali devono sembrare criminali, androidi, pattuglie robotiche o abitanti ostili dell'underground. Non animali. Non blob. Persone pericolose.

Regole nemici:

- Nessuna dimensione finale fissa.
- Facing right.
- Ogni nemico: idle, walk/move, attack, hurt/death.
- Lasciare liberta a proporzioni piu realistiche/stilizzate.
- I nemici possono essere piu alti e leggibili dei placeholder attuali.
- Dopo la generazione scaleremo ogni tipo e aggiorneremo hitbox/offset.

## Nemici

### 1. Walker / Criminale base

Gameplay:

- Cammina su piattaforme.
- Contatto danneggia.
- A volte torna in vita dopo 1 minuto; quando morto lascia cadavere basso a terra.

Concept:

- Criminale street gang underground.
- Cappuccio, maschera, bastone/cacciavite/lama improvvisata.
- Colore accento: arancio/rosa.

File:

- `enemy_walker_idle_6f.png`
- `enemy_walker_walk_8f.png`
- `enemy_walker_attack_5f.png`
- `enemy_walker_hurt_3f.png`
- `enemy_walker_corpse_1f.png`
- `enemy_walker_revive_8f.png`

### 2. Flyer / Jetpack criminale

Gameplay:

- Vola.
- Movimento leggero.

Concept:

- Umanoide con mini jetpack o drone harness.
- Non insetto.
- Giacca leggera, maschera, propulsori ciano.

File:

- `enemy_flyer_idle_6f.png`
- `enemy_flyer_fly_8f.png`
- `enemy_flyer_attack_5f.png`
- `enemy_flyer_hurt_3f.png`
- `enemy_flyer_death_6f.png`

### 3. Shooter / Sparatore

Gameplay:

- Spara proiettili.

Concept:

- Criminale con arma energetica artigianale.
- Silhouette con braccio/cannone leggibile.
- Colore: viola/ciano.

File:

- `enemy_shooter_idle_6f.png`
- `enemy_shooter_walk_8f.png`
- `enemy_shooter_aim_4f.png`
- `enemy_shooter_shoot_5f.png`
- `enemy_shooter_hurt_3f.png`
- `enemy_shooter_death_6f.png`

### 4. Charger / Bruto

Gameplay:

- Carica il player.

Concept:

- Umanoide grosso, gang enforcer.
- Spallacci, casco, giacca rinforzata.
- Non toro animale, ma puo avere silhouette aggressiva.
- Colore: rosso/rosa.

File:

- `enemy_charger_idle_6f.png`
- `enemy_charger_walk_8f.png`
- `enemy_charger_charge_8f.png`
- `enemy_charger_tired_5f.png`
- `enemy_charger_hurt_3f.png`
- `enemy_charger_death_6f.png`

### 5. Clone

Gameplay:

- Copia il giocatore al momento della morte.
- Usa armi, abilita, consumabili.
- Deve sembrare un eco ostile del player.

Concept:

- Versione distorta/verde del protagonista.
- Cappuccio simile, chitarra/arma simile, ma glitchata.
- Colore: verde acido + nero.

File:

- `enemy_clone_idle_6f.png`
- `enemy_clone_walk_8f.png`
- `enemy_clone_jump_4f.png`
- `enemy_clone_attack_side_6f.png`
- `enemy_clone_ranged_5f.png`
- `enemy_clone_super_8f.png`
- `enemy_clone_dash_5f.png`
- `enemy_clone_shield_4f.png`
- `enemy_clone_death_8f.png`

Prompt M12-D:

```text
Create a 2D game enemy sprite sheet for a dark cyberpunk underground platformer.
Style: fluid illustrated 2D, Hollow Knight-like mysterious silhouette mixed with neon cyberpunk, no pixel art.
Enemy concept: [INSERT ENEMY].
The enemy must look like a human criminal / android / underground hostile, not an animal or blob.
Canvas: no fixed pixel size required, transparent background, same frame size, generous transparent padding, facing right, feet/hover anchor consistent.
Strong readable silhouette, dark body with controlled neon accents.
Animation requested: [idle/walk/attack/etc], [frame count] frames.
No text, no watermark, no background.
```

---

# M12-E - Pickup, Consumabili, Proiettili, FX

## Pickup

Per pickup e consumabili si puo suggerire una dimensione piccola, ma non bloccarla rigidamente. Se un oggetto diventa piu iconico e interessante con una forma diversa, va bene: scaleremo in gioco. Per monete e FX piccoli la leggibilita conta piu della misura esatta.

### Monete

Valori:

- 1 coin: piccola, metallo sporco, `8x8` logico.
- 5 coin: oro, `10x10`.
- 10 coin: ciano raro, `12x12`.
- 20 coin: rosa/viola raro, `14x14`.

File:

- `pickup_coin_1_32x32_6f.png`
- `pickup_coin_5_32x32_6f.png`
- `pickup_coin_10_32x32_6f.png`
- `pickup_coin_20_32x32_6f.png`

Animazione:

- Rotazione o shimmer.
- Non troppo brillante.

### Vita

- `pickup_life_32x32_6f.png`
- Icona: cuore/capsula bio-neon.

### Abilita

- `pickup_ability_32x32_6f.png`
- Icona: chip/maschera/eco.

### Consumabili

1. `pickup_food_32x32_6f.png`
   - Cibo underground, razione neon.
2. `pickup_slow_time_32x32_6f.png`
   - Clessidra/chip tempo.
3. `pickup_teleport_32x32_6f.png`
   - Beacon rosa/ciano.
4. `pickup_mini_platform_32x32_6f.png`
   - Capsuletta piattaforma.
5. `pickup_camouflage_32x32_6f.png`
   - Maschera o mantello glitch.

## Proiettili / FX

Celle consigliate:

- Piccoli proiettili: `32x32`.
- Super player: `96x64`.
- Shield/stop/slow: texture/FX tile o sheet.

Queste dimensioni FX sono solo suggerimenti pratici. Le onde, aure, scie e super colpi possono essere piu grandi se artisticamente funzionano; poi verranno scalate o tagliate nel codice.

File:

- `fx_enemy_bullet_32x32_4f.png`
- `fx_player_ranged_32x32_4f.png`
- `fx_player_super_wave_96x64_8f.png`
- `fx_clone_super_wave_96x64_8f.png`
- `fx_shield_aura_96x96_8f.png`
- `fx_stop_field_128x128_8f.png`
- `fx_slow_field_128x128_8f.png`
- `fx_ground_slam_wave_128x64_8f.png`
- `fx_poison_tick_64x64_6f.png`
- `fx_teleport_anchor_64x64_8f.png`

Prompt M12-E:

```text
Create a clean transparent 2D game FX sprite sheet for a cyberpunk underground platformer.
Style: elegant neon energy, readable on dark background, Hollow Knight-like mysterious atmosphere mixed with cyberpunk.
FX/pickup: [INSERT NAME].
Canvas: [SUGGESTED SIZE IF NEEDED] px per frame, [FRAME COUNT] frames, transparent background. If no exact size is necessary, choose a generous consistent frame size and keep the effect centered.
Keep the effect centered, no text, no watermark, no background.
Avoid excessive glow that would obscure gameplay.
```

---

# M12-F - Ambiente, Piattaforme, Porte, Fondali

## Stanza

Dimensione stanza logica: `640x360`.

Gli asset ambiente devono essere modulari, non un singolo fondale fisso per ogni stanza, perche le stanze sono procedurali.

### Fondali

Creare layer:

1. `bg_underground_back_640x360.png`
   - Layer lontano: tunnel, palazzi sotterranei, tubi, luci lontane.
   - Deve essere scuro e poco contrastato.

2. `bg_underground_mid_640x360.png`
   - Layer medio: cavi, grate, insegne rotte, finestre neon.
   - Ancora non deve confondere piattaforme.

3. `bg_underground_front_details_640x360.png`
   - Dettagli davanti ma dietro gameplay: fumo, tubi, macchie, piccole luci.

4. `bg_checkpoint_room_640x360.png`
   - Variante stanza checkpoint, piu calma/sacra.

5. `bg_boss_room_640x360.png`
   - Variante stanza boss, piu minacciosa.

6. `bg_shop_room_640x360.png`
   - Variante stanza NPC/vendor.

### Checkpoint / luogo di salvataggio

Il checkpoint puo avere liberta artistica. Non deve essere un semplice cristallo o rettangolo.

Direzione consigliata:

- Un piccolo falo cyberpunk posizionato a terra.
- Oppure una lanterna elettrica, un amplificatore spento, una bobina neon, una radio sacra, una stazione di ricarica rituale.
- Inattivo: spento, freddo, quasi morto.
- Attivato: si accende con fuoco ciano/ambra, piccole scintille, fiamma elettrica o eco sonoro.
- Deve stare a terra e avere base chiara.
- Nessuna dimensione finale fissa: scaleremo e posizioneremo nel gioco.

File:

- `checkpoint_inactive_idle_4f.png`
- `checkpoint_activate_8f.png`
- `checkpoint_active_idle_6f.png`
- `fx_checkpoint_pulse_8f.png`

Prompt checkpoint:

```text
Create a 2D animated checkpoint object for a dark cyberpunk underground platformer.
Concept: a grounded cyberpunk bonfire / electric lantern / sacred amplifier used as a save point. It belongs to the underground outskirts of a neon city.
Style: fluid illustrated 2D, mysterious Hollow Knight-like mood mixed with cyberpunk. No pixel art.
No fixed pixel size required. Same frame size across the sheet, transparent background, grounded base, clear inactive and active states.
Inactive state: cold, dim, almost dead. Active state: cyan/amber electric flame or sound-like glow.
No text, no watermark, no background.
```

### Pareti e tiles

Pareti logiche: `16 px`.

Asset:

- `tile_wall_32x32.png`
- `tile_floor_32x32.png`
- `tile_ceiling_32x32.png`
- `tile_wall_side_32x32.png`
- `tile_wall_corner_32x32.png`
- `tile_door_glow_horizontal_56x16.png`
- `tile_door_glow_vertical_16x64.png`

### Piattaforme

Altezza piattaforme: circa `10-14 px`.

Tipi:

- Piattaforma one-way metallica.
- Piattaforma solida.
- Collina/terreno solido che parte dal suolo.
- Mini-piattaforma piazzata dal player.

Asset:

- `platform_short_64x16.png`
- `platform_medium_128x16.png`
- `platform_long_192x16.png`
- `platform_solid_128x24.png`
- `platform_mini_74x10.png`
- `hill_ground_chunk_96x64.png`
- `hill_ground_chunk_160x96.png`
- `hill_ground_slope_left_128x96.png`
- `hill_ground_slope_right_128x96.png`

Prompt M12-F fondale:

```text
Create a 640x360 2D background layer for a dark cyberpunk underground platformer.
Setting: abandoned underground outskirts beneath a neon city, tunnels, pipes, cables, broken signs, distant city infrastructure, mysterious atmosphere.
Style: painterly illustrated, Hollow Knight-like mood mixed with cyberpunk, dark and readable, not pixel art.
Important: this is gameplay background, so keep contrast low in the center and avoid bright shapes that look like platforms or enemies.
No text, no UI, no characters. PNG layer.
```

Prompt M12-F piattaforme:

```text
Create modular 2D platform tiles for a dark cyberpunk underground platformer.
Style: illustrated, non-pixel-art, dark metal, worn concrete, neon edge accents, readable on dark background.
Asset: [INSERT PLATFORM TYPE AND SIZE].
Transparent background. Tile must be horizontally repeatable if possible. No text, no watermark.
```

---

# M12-G / H / I / J / K / L - Boss

Ci sono 22 archetipi boss. Ogni vicolo cieco del labirinto deve contenere un boss, massimo 22 boss diversi in una run, mai duplicati nella stessa run.

Regole boss:

- Nessuna dimensione finale fissa.
- Ogni boss deve avere liberta artistica di forma, altezza, larghezza e silhouette.
- I boss possono essere molto piu grandi o strani dei placeholder attuali.
- Boss grounded: piedi/base sempre coerenti tra frame.
- Boss volanti: hover anchor coerente tra frame.
- Dopo la generazione scaleremo ogni boss e aggiorneremo hitbox/offset nel gioco.

Ogni boss deve avere:

- `idle`
- `move`
- `attack telegraph`
- `attack active`
- `hurt`
- `death`
- FX specifici del suo attacco

Non generare tutti i boss insieme. Fare batch da 4 boss.

## Boss Batch 1 - Boss base approvati

### 1. Warden

Gameplay:

- Si muove.
- Spara raffica di 3 proiettili, con pausa.

Concept:

- Agente/guardiano robotico corrotto.
- Armatura da sorvegliante underground.
- Braccio-cannone.

File:

- `boss_warden_idle_6f.png`
- `boss_warden_move_8f.png`
- `boss_warden_burst_8f.png`
- `boss_warden_hurt_3f.png`
- `boss_warden_death_10f.png`
- `fx_warden_bullet_32x32_4f.png`

### 2. Charger

Gameplay:

- Insegue/carica.
- Si stanca dopo tempo cumulato e riposa.

Concept:

- Enforcer enorme con esoscheletro urbano.
- Non animale.
- Spalle larghe, casco, motori sulle gambe.

File:

- `boss_charger_idle_6f.png`
- `boss_charger_run_10f.png`
- `boss_charger_tired_6f.png`
- `boss_charger_hurt_3f.png`
- `boss_charger_death_10f.png`

### 3. Skimmer

Gameplay:

- Vola.
- Spara pattern a croce `+`, poi diagonale `x`, e un colpo mirato.

Concept:

- Drone umanoide volante / criminale con hover rig.
- Maschera e mantello leggero.

File:

- `boss_skimmer_idle_6f.png`
- `boss_skimmer_fly_8f.png`
- `boss_skimmer_shoot_plus_8f.png`
- `boss_skimmer_shoot_x_8f.png`
- `boss_skimmer_hurt_3f.png`
- `boss_skimmer_death_10f.png`
- `fx_skimmer_bullet_32x32_4f.png`

### 4. Sentinel

Gameplay:

- Braccio estensibile, anche diagonale.
- Si muove ignorando un po i limiti piattaforme.

Concept:

- Umanoide allungabile con braccio meccanico/tentacolo industriale.
- Cyberpunk body horror, ma leggibile.

File:

- `boss_sentinel_idle_6f.png`
- `boss_sentinel_move_8f.png`
- `boss_sentinel_arm_windup_5f.png`
- `boss_sentinel_arm_extend_6f.png`
- `boss_sentinel_hurt_3f.png`
- `boss_sentinel_death_10f.png`
- `fx_sentinel_arm_segment_32x32.png`

## Boss Batch 2

### 5. Orbiter

Gameplay:

- Vola.
- Tre pallini orbitano lentamente.
- Si allargano molto e rimangono fuori per piu tempo.

Concept:

- Boss levitante con tre satelliti/relitti magnetici.
- Corpo centrale elegante, quasi religioso/tecnologico.

File:

- `boss_orbiter_idle_6f.png`
- `boss_orbiter_fly_8f.png`
- `boss_orbiter_expand_8f.png`
- `boss_orbiter_hurt_3f.png`
- `boss_orbiter_death_10f.png`
- `fx_orbiter_satellite_32x32_6f.png`

### 6. Architect

Gameplay:

- Genera blocchi volanti che arrivano da fuori e cercano di chiudere il player in una cella.
- Se il player viene chiuso, la cella fa scossa e toglie vita.

Concept:

- Costruttore/hacker architetto criminale.
- Manipola pannelli modulari e barriere.

File:

- `boss_architect_idle_6f.png`
- `boss_architect_move_8f.png`
- `boss_architect_summon_8f.png`
- `boss_architect_hurt_3f.png`
- `boss_architect_death_10f.png`
- `fx_architect_block_flying_32x64_6f.png`
- `fx_architect_cell_shock_128x128_8f.png`

### 7. Mirage

Gameplay:

- Bombe/illusioni warning e blast.

Concept:

- Illusionista neon, criminale con cloni olografici.

File:

- `boss_mirage_idle_6f.png`
- `boss_mirage_move_8f.png`
- `boss_mirage_cast_8f.png`
- `boss_mirage_hurt_3f.png`
- `boss_mirage_death_10f.png`
- `fx_mirage_bomb_warn_48x48_6f.png`
- `fx_mirage_blast_48x48_6f.png`

### 8. Magnetar

Gameplay:

- Campo magnetico che tira.
- Core dannoso.

Concept:

- Boss magnetico industriale, corpo pesante con anelli gravitazionali.

File:

- `boss_magnetar_idle_6f.png`
- `boss_magnetar_move_8f.png`
- `boss_magnetar_pull_8f.png`
- `boss_magnetar_hurt_3f.png`
- `boss_magnetar_death_10f.png`
- `fx_magnetar_field_192x192_8f.png`

## Boss Batch 3

### 9. Threader

Gameplay:

- Vola.
- Crea laser orizzontale e verticale contemporanei.

Concept:

- Tessitore di laser, corpo sottile, nodi flottanti.

File:

- `boss_threader_idle_6f.png`
- `boss_threader_fly_8f.png`
- `boss_threader_cast_8f.png`
- `fx_threader_node_32x32_6f.png`
- `fx_threader_laser_horizontal_192x24_6f.png`
- `fx_threader_laser_vertical_24x192_6f.png`

### 10. Bellows

Gameplay:

- Bolle/gusti che spingono.

Concept:

- Boss con mantice industriale, compressore a spalla, onde d'aria sporca.

File:

- `boss_bellows_idle_6f.png`
- `boss_bellows_move_8f.png`
- `boss_bellows_blow_8f.png`
- `fx_bellows_bubble_64x64_8f.png`

### 11. Rainmaker

Gameplay:

- Lance/pioggia verticale da sopra.

Concept:

- Criminale rituale che richiama aste/antenne energetiche dal soffitto.

File:

- `boss_rainmaker_idle_6f.png`
- `boss_rainmaker_move_8f.png`
- `boss_rainmaker_cast_8f.png`
- `fx_rainmaker_warning_column_32x360_4f.png`
- `fx_rainmaker_spear_32x96_6f.png`

### 12. Phase

Gameplay:

- Insegue in modo aggressivo.
- Shock/teleport marker.

Concept:

- Assassino phasing, corpo spezzato/glitch.

File:

- `boss_phase_idle_6f.png`
- `boss_phase_chase_8f.png`
- `boss_phase_vanish_6f.png`
- `boss_phase_reappear_6f.png`
- `fx_phase_marker_64x64_6f.png`

## Boss Batch 4

### 13. Sawbloom

Gameplay:

- Vola.
- Cubi/blade gialli che appaiono con warning marrone e poi diventano pericolosi.

Concept:

- Fiore meccanico volante, lame industriali orbitanti.

File:

- `boss_sawbloom_idle_6f.png`
- `boss_sawbloom_fly_8f.png`
- `boss_sawbloom_bloom_8f.png`
- `fx_sawbloom_warning_cube_32x32_4f.png`
- `fx_sawbloom_blade_cube_32x32_6f.png`

### 14. Burrower

Gameplay:

- Scappa dal player.
- Si teletrasporta/riemerge.
- Attacca con eruzione dal suolo.

Concept:

- Contrabbandiere/robot scavatrice, mantello sporco, trivelle.

File:

- `boss_burrower_idle_6f.png`
- `boss_burrower_flee_8f.png`
- `boss_burrower_burrow_6f.png`
- `boss_burrower_emerge_6f.png`
- `fx_burrower_warning_96x24_4f.png`
- `fx_burrower_erupt_96x128_8f.png`

### 15. Ricochet

Gameplay:

- Mira player o alterna casuale/mirato.
- Scatta rimbalzando.

Concept:

- Pattinatore/assassino con armatura riflettente.

File:

- `boss_ricochet_idle_6f.png`
- `boss_ricochet_move_8f.png`
- `boss_ricochet_aim_5f.png`
- `boss_ricochet_dash_6f.png`
- `fx_ricochet_trail_96x32_6f.png`

### 16. Harpoon

Gameplay:

- Mira player.
- Lancia arpione/ancora e tira.

Concept:

- Cacciatore urbano con arpione magnetico.

File:

- `boss_harpoon_idle_6f.png`
- `boss_harpoon_move_8f.png`
- `boss_harpoon_aim_5f.png`
- `boss_harpoon_fire_6f.png`
- `fx_harpoon_chain_96x16.png`
- `fx_harpoon_tip_32x32_4f.png`

## Boss Batch 5

### 17. Chronos

Gameplay:

- Rift/linee temporali che attraversano la stanza.

Concept:

- Boss orologiaio/hacker temporale, glitch di frame, maschera orologio neon.

File:

- `boss_chronos_idle_6f.png`
- `boss_chronos_move_8f.png`
- `boss_chronos_cast_8f.png`
- `fx_chronos_rift_96x32_8f.png`

### 18. Prism

Gameplay:

- Vola.
- Nodi e triangoli laser.

Concept:

- Boss prisma, corpo specchiato, tre droni/lenti.

File:

- `boss_prism_idle_6f.png`
- `boss_prism_fly_8f.png`
- `boss_prism_cast_8f.png`
- `fx_prism_node_32x32_6f.png`
- `fx_prism_beam_128x24_6f.png`

### 19. Sonar

Gameplay:

- Onde/radar espansive.

Concept:

- Musicista corrotto/radar bot, usa casse acustiche e onde sonore.
- Interessante contrasto col player chitarrista.

File:

- `boss_sonar_idle_6f.png`
- `boss_sonar_move_8f.png`
- `boss_sonar_pulse_8f.png`
- `fx_sonar_wave_192x192_8f.png`

### 20. Lockjaw

Gameplay:

- Si muove piu veloce.
- Onde/mandibole che chiudono.

Concept:

- Gang leader con maschera mandibola meccanica.
- Molto veloce e aggressivo.

File:

- `boss_lockjaw_idle_6f.png`
- `boss_lockjaw_run_8f.png`
- `boss_lockjaw_bitewave_8f.png`
- `fx_lockjaw_wave_64x32_6f.png`

## Boss Batch 6

### 21. Volley

Gameplay:

- Spara colpi multipli/raffiche.

Concept:

- Armaiolo criminale con spallacci lanciamissili artigianali.

File:

- `boss_volley_idle_6f.png`
- `boss_volley_move_8f.png`
- `boss_volley_fire_8f.png`
- `fx_volley_bullet_32x32_4f.png`

### 22. Hopper

Gameplay:

- Salta tra piattaforme.
- Deve poter scendere e non restare bloccato sotto soffitti.

Concept:

- Acrobata criminale con gambe potenziate / parkour bot.

File:

- `boss_hopper_idle_6f.png`
- `boss_hopper_hop_8f.png`
- `boss_hopper_fall_4f.png`
- `boss_hopper_land_5f.png`
- `boss_hopper_hurt_3f.png`
- `boss_hopper_death_10f.png`

Prompt boss generico:

```text
Create a 2D boss sprite sheet for a dark cyberpunk underground platformer.
Style: fluid illustrated 2D, Hollow Knight-like mysterious and iconic silhouette mixed with cyberpunk machinery. No pixel art.
Boss: [BOSS NAME].
Gameplay identity: [INSERT GAMEPLAY].
Visual concept: [INSERT CONCEPT].
Canvas: no fixed pixel size required, transparent background, same frame size, generous transparent padding, facing right unless flying. Use consistent feet/base or hover anchor.
Strong readable silhouette, dark body with controlled neon accents. Must be readable at small size.
Animation requested: [idle/move/attack/hurt/death], [frame count] frames.
No text, no watermark, no background.
```

---

# 6. UI, Menu, Portrait, Map

Questi asset possono arrivare dopo gameplay sprite.

## Menu Home

Asset:

- `ui_title_logo_echo_maze.png`
- `ui_menu_background_1920x1080.png`
- `ui_button_frame.png`
- `ui_language_panel.png`
- `ui_controls_panel.png`

Mood:

- Ingresso nella periferia underground.
- Non landing page commerciale.
- Deve sembrare schermata di gioco misteriosa.

## Game Over / Victory

Asset:

- `ui_game_over_background_1920x1080.png`
- `ui_victory_background_1920x1080.png`
- `ui_new_run_button.png`
- `ui_return_menu_button.png`

## HUD

Asset:

- Icona vita.
- Icona monete.
- Icona arma.
- Icona super.
- Icone abilita.
- Icone consumabili.
- Cornice minimappa.

---

# 7. Controllo Qualita Asset

Prima di importare:

1. Scegliere scala finale in gioco dopo aver visto lo sprite.
2. Guardarlo su sfondo `#171927`.
3. Deve essere leggibile entro 1 secondo.
4. La silhouette deve distinguersi.
5. I piedi devono restare stabili nelle animazioni.
6. Non deve sembrare pixel art.
7. Non deve cambiare costume tra frame.
8. Non deve avere ombre/tagli/crop strani.
9. Gli attacchi devono comunicare direzione.
10. Boss e nemici devono essere distinguibili fra loro.
11. Aggiornare hitbox, offset, anchor e collisioni in base allo sprite, non il contrario.

Test tecnico:

- Aprire sheet e controllare che tutte le celle abbiano identica dimensione.
- Controllare trasparenza vera.
- Controllare che il background sia assente.
- Se chroma key: rimuovere perfettamente il verde.

---

# 8. Prompt Master da Dare a ChatGPT

Questo prompt spiega il progetto prima di chiedere ogni milestone.

```text
We are creating art assets for a 2D action-platform roguelite/metroidvania called Echo Maze.

Setting:
The game takes place in the underground outskirts of a neon cyberpunk city. It is a procedural labyrinth of dark rooms, broken infrastructure, criminal hideouts, strange vendors, robot patrols, hostile clones and minibosses hidden in dead ends. The tone is mysterious, poetic, dangerous and stylish.

Art direction:
Fluid hand-painted / clean illustrated 2D, NOT pixel art. The mood should feel like Hollow Knight mixed with cyberpunk underground street culture. Use strong silhouettes, dark bodies, small controlled neon accents, elegant shapes, readable gameplay clarity. Characters should be iconic, mysterious and memorable.

Technical:
The game logic room is 640x360 px. Sprites are used in a canvas game. Generate transparent PNG sprite sheets. Every frame must have the same cell size, consistent character design, consistent feet baseline/anchor, character facing right. No text, no watermark, no background. Keep the asset readable at small gameplay size.

Important technical/art rule:
Do NOT force player, NPCs, enemies, bosses, clones or checkpoint objects into the current placeholder hitbox sizes. Those old sizes were made for simple placeholder shapes. For characters and iconic objects, choose the best artistic proportions and silhouette first; the game implementation will later resize sprites and adjust hitboxes/offsets/collisions. Exact pixel dimensions are required only for room backgrounds, platforms, doors, tiles, UI panels and other environment assets that must align to the 640x360 canvas.

Important:
Do not generate all assets at once. We will work milestone by milestone. For this request, generate only the assets listed in the current milestone.

Negative style:
No 8-bit, no pixel art, no realistic photos, no medieval fantasy, no cute animal enemies, no overly busy details, no cropped limbs, no inconsistent costumes, no random character redesigns between frames.
```

---

# 9. Ordine Consigliato di Produzione

Usare questo ordine pratico:

1. Player idle test.
2. Player walk/run/jump.
3. Player attacks con chitarra.
4. NPC vendor.
5. Nemici normali.
6. Pickup e proiettili.
7. Ambiente base.
8. Boss batch 1.
9. Boss batch 2.
10. Boss batch 3.
11. Boss batch 4.
12. Boss batch 5.
13. Boss batch 6.
14. UI, menu, game over/victory.
15. Polish finale: palette, contrasto, consistenza.

---

# 10. Nota Finale

La cosa piu importante non e il numero di sprite, ma la coerenza.

Prima di generare tutte le animazioni, bisogna bloccare:

- silhouette player;
- chitarra-arma;
- stile occhi/visor;
- palette;
- scala;
- livello di dettaglio;
- tipo di contorno;
- resa del neon.

Se il player non funziona, tutto il resto sembrera meno coerente. Quindi M12-A va trattata come la milestone piu importante.
