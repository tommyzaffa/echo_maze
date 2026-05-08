# Game Specification Report — "Echo Maze" (working title)

## Documento di specifica per Claude Code

> **Obiettivo del documento:** fornire a Claude Code tutte le informazioni necessarie per implementare un metroidvania 2D roguelite browser-based (HTML/CSS/JS vanilla, niente framework, niente backend) con generazione procedurale del labirinto, IA dei cloni e tutte le meccaniche descritte.

---

## 1. Sintesi del progetto

**Echo Maze** è un metroidvania 2D giocabile interamente nel browser su PC, controllato da tastiera. Una partita dura tra i 30 e i 60 minuti e ogni run è procedurale: layout, contenuto delle stanze, posizione di NPC, miniboss e checkpoint cambiano ogni volta.

Il giocatore esplora un labirinto 9×9, combatte nemici, raccoglie monete e potenziamenti, e deve uccidere tutti i **cloni** generati nel labirinto. Ogni morte del giocatore genera un nuovo clone con le sue stats di quel momento. Se il numero di cloni vivi supera 10 → game over. Se il giocatore uccide tutti i cloni esistenti → vittoria.

**Stack tecnico richiesto:**
- HTML5 (Canvas 2D per il rendering del gameplay, DOM per UI/menu/HUD)
- CSS3
- JavaScript vanilla (ES6+ moduli)
- Nessun framework, nessun build system pesante (al massimo un dev server statico)
- Nessun asset esterno richiesto in fase iniziale: placeholder grafici geometrici (rettangoli colorati, cerchi) con possibilità futura di sostituirli con sprite

**Stile grafico provvisorio:** non prioritario in fase tecnica. Idea narrativa di riferimento: protagonista incappucciato in città underground, "spada" rappresentata come chitarra, cloni come copie robotiche. Il codice deve essere strutturato in modo che sostituire i placeholder con sprite/animazioni sia banale.

---

## 2. Architettura consigliata

Suggerimento di organizzazione dei file (Claude Code può proporre alternative):

```
/index.html
/style.css
/src/
  main.js              // entry point, game loop
  config.js            // costanti, bilanciamento, valori numerici
  input.js             // gestione tastiera
  /core/
    gameState.js       // stato globale (player, clones, maze, run)
    sceneManager.js    // gestione scene: menu, gameplay, shop, gameover
  /maze/
    mazeGenerator.js   // generazione 9x9, connessioni, vincoli
    roomGenerator.js   // generazione piattaforme dentro la singola cella
    minimap.js         // rendering minimappa, fog of war
  /entities/
    player.js
    clone.js           // IA pathfinding + combattimento
    enemy.js           // nemici base
    miniboss.js
    npc.js
    projectile.js
    pickup.js          // monete, vite, drop
  /systems/
    physics.js         // gravità, collisioni AABB
    combat.js
    abilities.js       // doppio salto, wall jump, dash, ecc.
    consumables.js
    economy.js         // monete, shop
    checkpoint.js
    pathfinding.js     // A* o BFS sul grafo delle stanze
  /ui/
    hud.js             // vite, monete, arma, abilità, consumabili
    shopUI.js
    menus.js           // start, pausa, gameover, vittoria
  /utils/
    rng.js             // RNG seedabile per debug
    math.js
```

**Game loop:** `requestAnimationFrame` con timestep fisso (es. 60 Hz logico) e rendering interpolato. Pausa totale quando il giocatore interagisce con un NPC o apre un menu.

**Pattern entity-component leggero** (non serve un ECS completo): ogni entità è un oggetto con `update(dt)` e `render(ctx)`.

---

## 3. Mappa: struttura del labirinto

### 3.1 Griglia
- Labirinto **9×9** = 81 celle (stanze).
- Coordinate `(x, y)` con `x, y ∈ [0, 8]`.
- Cella di partenza del giocatore: **(4, 4)** (centro).

### 3.2 Connessioni tra celle
Ogni cella può avere fino a 4 uscite (Nord, Sud, Est, Ovest). Vincoli da rispettare in fase di generazione:

- Ogni cella deve essere connessa ad almeno 1 cella adiacente.
- Il grafo deve essere **completamente connesso** (tutte le 81 celle raggiungibili dal centro).
- Distribuzione target dei gradi (numero di uscite per cella):
  - Maggioranza con **2 o 3 uscite** (target ~70–80% del totale, distribuite tra i due gradi).
  - Pochi vicoli ciechi (1 uscita): target ~10–15%.
  - Resto con 4 uscite.
- I vicoli ciechi sono "stanze miniboss" (vedi §6).

### 3.3 Algoritmo di generazione suggerito
1. Genera uno **spanning tree** sulla griglia con random walk o Prim/Kruskal a partire dal centro → garantisce connettività.
2. Aggiungi archi extra in modo casuale fino a raggiungere la distribuzione di gradi target.
3. Verifica i vincoli; se non soddisfatti, regenerate (raro).
4. Etichetta le celle con 1 sola uscita come `deadEnd = true` → diventano stanze miniboss.

### 3.4 Posizionamento speciale (sempre randomico per run)
- **Cella di partenza:** (4, 4) — fissa.
- **4 angoli (0,0), (0,8), (8,0), (8,8):** sono i possibili spawn iniziali del primo clone (1 dei 4 a caso).
- **5 checkpoint:** posizionati casualmente, mai sulla cella di partenza, mai su vicoli ciechi, distanza minima reciproca consigliata di ~2 celle (manhattan).
- **4 NPC:** posizionati casualmente, uno per tipologia (vita/cibo, abilità, consumabili da combattimento, fabbro/upgrade arma). Mai in cella di partenza, mai in vicoli ciechi, mai sovrapposti.
- **Miniboss:** uno per ciascun vicolo cieco.
- **Pickup sparsi (monete, vite):** distribuiti random nelle stanze normali (vedi §7 per i tetti massimi).

---

## 4. Stanze: layout interno

### 4.1 Dimensioni e telecamera
- Ogni stanza è una "schermata" di gioco, dimensione consigliata: **640×360 px logici** (rapporto 16:9), scalata a fullscreen.
- Telecamera fissa per stanza (no scrolling). Il cambio stanza avviene attraversando un'uscita ai bordi.

### 4.2 Uscite (porte/varchi)
Ogni cella può avere fino a 4 uscite, una per lato. La **posizione di ciascuna uscita lungo il lato è casuale**, non fissa al centro:

- **Nord (soffitto):** apertura in una posizione casuale lungo la fascia superiore (es. `x ∈ [margin, room_width - margin - door_width]`).
- **Sud (pavimento):** apertura in una posizione casuale lungo la fascia inferiore.
- **Est (parete destra):** apertura a un'altezza casuale (es. `y ∈ [margin, room_height - margin - door_height]`).
- **Ovest (parete sinistra):** apertura a un'altezza casuale.

Quindi tra due celle adiacenti collegate, le due uscite combacianti possono trovarsi in qualunque punto del lato condiviso: sotto a sinistra in una run, in alto a destra in un'altra. Questo aumenta la varietà visiva e di gameplay tra run.

**Vincolo di coerenza tra celle adiacenti:** se la cella A è collegata alla cella B sul lato Est di A (= lato Ovest di B), l'uscita Est di A e l'uscita Ovest di B devono trovarsi alla stessa altezza, in modo che il giocatore esca da una e rientri nell'altra senza salti di posizione. Stessa logica per le coppie Nord/Sud (devono condividere la coordinata x). Quindi la posizione dell'uscita va decisa una volta per ciascun arco del grafo, non due volte.

Le uscite Nord/Est/Ovest possono essere **alte rispetto al pavimento**: la generazione delle piattaforme deve garantire che il giocatore le possa raggiungere con i salti base (senza richiedere abilità non ancora ottenute).

### 4.3 Generazione delle piattaforme — vincolo di percorribilità
Algoritmo suggerito:
1. Posiziona il pavimento e le pareti, lasciando aperture nelle uscite.
2. Calcola la posizione di ogni uscita esistente.
3. Per ogni uscita non raggiungibile a piedi (es. Nord nel soffitto, Est rialzata), pianta una "catena di piattaforme" dal pavimento fino all'uscita rispettando le distanze massime di salto del giocatore base (es. salto verticale max ~80 px, salto orizzontale max ~120 px — calibrare).
4. Aggiungi piattaforme decorative/random rispettando i percorsi obbligati.
   - Oltre alle piattaforme necessarie per raggiungere uscite e percorsi principali, ogni stanza può avere **0-2 piattaforme loose** casuali.
   - Le piattaforme loose non devono per forza appartenere al path validato o essere raggiungibili dal giocatore base; servono a dare variazione e possono ospitare elementi opzionali.
   - Non devono riempire troppo la stanza e non devono bloccare fisicamente i percorsi obbligati.
5. **Validazione:** un BFS sulle piattaforme deve confermare che ogni uscita sia raggiungibile dal punto di spawn della stanza con i soli salti base.

> **Importante:** non si possono richiedere doppio salto o wall jump per attraversare il labirinto principale, perché sono abilità acquistabili/sbloccabili. Possono però essere usate come scorciatoie.

### 4.4 Spawn nella stanza
Quando il giocatore entra da un'uscita, spawna in una posizione coerente: entra da Nord → cade dall'alto; da Sud → emerge dal basso (o resta a terra accanto all'uscita inferiore); da Est/Ovest → entra dal lato.

---

## 5. Player

### 5.1 Stats iniziali
- **Vite:** 3 slot pieni (max 10 slot, vedi §7.3 e §5.4).
- **Arma:** livello 1 (di 5), corto raggio (mischia tipo "fendente di chitarra").
- **Super arma:** livello 1 (di 3), barra di carica vuota (vedi §5.6).
- **Monete:** 0.
- **Abilità:** nessuna.
- **Consumabili:** nessuno.
- **Cibo (heal items):** nessuno.

### 5.2 Movimento base (sempre disponibile)
- Camminata sinistra/destra.
- Salto singolo.
- Attacco mischia con l'arma.

### 5.3 Controlli (proposti, configurabili)
| Azione | Tasto |
|---|---|
| Movimento orizzontale | A / D oppure ← / → |
| Salto | Spazio o W |
| Attacco mischia | J |
| Attacco a distanza (se sbloccato) | K |
| Dash / Corsa (se sbloccata) | Shift |
| Scudo (se sbloccato) | L |
| Schianto a terra (se sbloccato) | S in aria oppure ↓ |
| Stop ability (se sbloccata) | Q |
| Super arma (se carica) | F |
| Slot consumabile 1/2/3/4 | 1 / 2 / 3 / 4 |
| Apri minimappa | M (toggle) |
| Pausa | Esc |

### 5.4 Combattimento, vite e danni
- **Slot vite vs vite correnti:** il giocatore ha un numero di **slot vita** (`maxLifeSlots`, da 3 a 10) e un numero di **vite correnti** (`currentLife ≤ maxLifeSlots`). Gli slot extra si comprano permanentemente dal Guaritore. Le vite correnti scendono coi colpi nemici (-1 per colpo) e si ricaricano col cibo (+1) o passando da un checkpoint (full).
- Frame di invulnerabilità (~1 s) con lampeggio dopo ogni colpo subito.
- Vita 0 → muore, respawn al checkpoint più recente attivato (vite ricaricate al massimo). Mantiene arma, super arma, abilità, consumabili, monete, slot vita. Genera un nuovo clone (vedi §8).
- Il cibo (acquistato dall'NPC) è un consumabile separato: cura 1 vita all'uso, fino al cap dato dagli slot.

### 5.5 Livelli arma (1–5)
Ogni livello aumenta danno e leggermente la hitbox (range mischia). L'arma si potenzia solo presso l'NPC fabbro. Costo crescente (es. 50 / 120 / 250 / 500 / 1000 monete — da bilanciare).

### 5.6 Super arma (passiva, sempre disponibile)
Il giocatore ha fin dall'inizio una **barra super potere** caricabile.

- La barra si riempie **solo colpendo i nemici** (incluso il colpo che li uccide). Anche colpire i cloni la riempie.
- Una volta piena, la barra **non continua ad accumularsi**: resta a 100% finché non viene scaricata.
- Attivazione col tasto `F` (vedi §5.3): il giocatore scatena un'esplosione di energia ad area attorno a sé, con danno alto a tutti i nemici/cloni nel raggio. Subito dopo la barra si svuota e ricomincia a riempirsi colpendo nemici.
- **Livelli (1–3)** della super arma, indipendenti dal livello dell'arma normale:
  - L1 (iniziale): danno base, raggio piccolo.
  - L2: danno e raggio medi.
  - L3 (massimo): danno e raggio grandi.
  - Tutti i numeri (danno, raggio, "carica per colpo") in `config.js`, da bilanciare.
- **Come si potenzia:** identica logica della distribuzione delle abilità (vedi §6.3 / §7.2):
  - Pickup sparso sulla mappa, **e/o**
  - Ricompensa di un miniboss, **e/o**
  - Acquisto presso il Fabbro.
  - Ogni run garantisce sempre la presenza di entrambi gli upgrade (L1→L2 e L2→L3) raggiungibili in qualche modo.

---

## 6. Nemici e miniboss

### 6.1 Nemici base
Posizionati randomicamente nelle stanze normali (escluso centro, NPC, checkpoint). Tipi suggeriti (Claude Code può scegliere il numero):
- **Walker:** cammina avanti e indietro, danno melee.
- **Flyer:** vola, insegue il giocatore in linea retta.
- **Shooter:** stazionario, spara proiettili lenti.
- **Charger:** carica quando vede il giocatore.

Ogni nemico ucciso droppa 1–5 monete. Possono droppare raramente cibo o vite.

### 6.2 Miniboss
- Uno per ogni vicolo cieco del labirinto.
- Quando il giocatore entra in un vicolo cieco, **l'uscita si chiude** sia per il giocatore che per i cloni (i cloni in arrivo trovano la porta chiusa e cambiano percorso).
- Sconfitto il miniboss, l'uscita si riapre e la stanza droppa **una** ricompensa scelta casualmente tra: monete (importo medio), 1 vita, 1 abilità, 1 upgrade super arma (vedi §5.6), 1 consumabile.
- I miniboss hanno HP scalati e pattern di attacco distinti (Claude Code può proporre 4–6 archetipi).

### 6.3 Distribuzione di abilità e upgrade super arma
Tutte le 8 (o più) abilità del gioco sono **sempre presenti in ogni run**, distribuite random tra:
- Stock dell'NPC Mistico,
- Ricompense dei miniboss,
- Pickup sparsi nelle stanze normali del labirinto.

Una stessa abilità può comparire in più posti contemporaneamente (es. il Mistico la vende e un miniboss la droppa) — purché ne esista almeno una istanza accessibile. **Mai assenti.**

I 2 upgrade della super arma (L1→L2 e L2→L3, vedi §5.6) seguono la **stessa logica di distribuzione**, con lo stesso vincolo: entrambi devono esistere in ogni run, in qualche combinazione tra Fabbro / miniboss / pickup sparso.

- Non c'è nessuna abilità "fissa" lato miniboss né lato NPC.
- Vincolo di completabilità: oltre alla presenza, il validatore di generazione conferma che le abilità/upgrade siano effettivamente raggiungibili (`MIN_ABILITIES_REACHABLE` e `MIN_SUPER_UPGRADES_REACHABLE` in `config.js`).
- I miniboss possono droppare in alternativa monete, vite o consumabili: la ricompensa di ogni miniboss è random e indipendente.

---

## 7. NPC e shop

### 7.1 I 4 NPC
Posizionati ognuno in una cella random non speciale.

| NPC | Vende |
|---|---|
| Guaritore | Vite extra (max 10 totali in mappa, vedi §7.3), cibo consumabile (cura +1 vita ciascuno, stackabile). |
| Mistico | Abilità (vedi §9). |
| Armaiolo | Consumabili da combattimento (vedi §10). |
| Fabbro | Upgrade arma livello 2 → 5; upgrade super arma L2 e L3 (se presenti nella run, vedi §5.6 e §6.3). |

### 7.2 Inventario randomico per run
Ogni NPC ad inizio run riceve un sottoinsieme randomico del proprio catalogo:
- **Mistico:** vende un sottoinsieme casuale delle abilità del gioco. Le abilità non vendute dal Mistico sono o ricompense dei miniboss o assenti dalla run (vedi §6.3 per il sistema di distribuzione).
- **Armaiolo, Guaritore, Fabbro:** stesso principio — selezione random ma garantendo che il gioco resti completabile.
- Vincolo di completabilità: ogni run deve poter essere finita; quindi la generazione deve assicurarsi che il giocatore possa accedere a un minimo di abilità/consumabili/upgrade per affrontare i cloni.

### 7.3 Cap globale vite nella mappa
Il numero **totale** di vite disponibili come pickup nella mappa (drop sparsi + venduti dall'NPC + possibili drop miniboss) non può superare **10**. Questo va gestito globalmente in fase di generazione e tracciato dinamicamente.

### 7.4 Interazione con NPC
- Premendo `E` (o tasto interagisci) vicino all'NPC si apre la UI dello shop.
- **Tutto si congela** quando lo shop è aperto: nemici, cloni, proiettili, timer del clone, fisica. Solo l'UI risponde.
- Si esce dallo shop con `Esc` o tasto dedicato.

---

## 8. Cloni

### 8.1 Primo clone (Boss principale)
- Generato all'avvio della run in 1 dei 4 angoli del labirinto (anche se l'angolo è un vicolo cieco/miniboss: nessun problema, si muoverà subito).
- Stats massime: 10 vite, arma livello 5, **super arma livello 3**, **tutte** le abilità del gioco, consumabili **infiniti** (può usarli senza limiti), **niente cibo** (non si cura mai).
- La barra della super arma del clone parte vuota e si carica colpendo il giocatore (stessa regola del giocatore, §5.6); una volta piena la usa.
- È **il bersaglio principale** della run.

### 8.2 Cloni successivi (generati dalle morti del giocatore)
- Ogni morte del giocatore → spawna 1 nuovo clone in una cella random (non quella in cui è il giocatore, non centro).
- Stats del nuovo clone = stats del giocatore al momento della morte: stessi `maxLifeSlots` (al massimo della propria capienza), stesso livello arma, **stesso livello super arma**, stesse abilità sbloccate, stessi consumabili nello **stesso numero finito** (NON infiniti, a differenza del primo clone).
- Anche i cloni successivi non hanno mai cibo.
- La barra della super arma del clone parte vuota e si carica colpendo il giocatore.
- Una volta generato, il clone segue le stesse regole di IA del primo (vedi §8.3).

### 8.3 IA dei cloni
Due modalità:

**A) "Hunting"** (default, fuori dalla stanza del giocatore):
- Pathfinding sul **grafo delle stanze** (BFS/A*) verso la cella corrente del giocatore.
- **Non usare lo shortest path puro:** introdurre un fattore di "errante" (es. tra i percorsi la cui lunghezza è ≤ shortest_path × 1.5, scegliere casualmente; oppure pesare gli archi con rumore). Obiettivo: percorso di durata media, non pressione costante.
- Velocità di traversata stanza: bilanciata in modo che il giocatore abbia tempo di esplorare/farmare. Suggerimento iniziale: 1 cella ogni 6–10 secondi.

**B) "Combat"** (quando entra nella stanza del giocatore):
- Cambia comportamento: AI da combattente con tutte le sue abilità (doppio salto, dash, scudo, ecc.).
- Pattern aggressivi ma non letali in 1 colpo: 1 colpo = -1 vita giocatore.
- Usa consumabili (ha rallentatore, teletrasporto, ecc., infiniti).
- Se il giocatore esce dalla stanza, torna in modalità Hunting.

### 8.4 Visualizzazione sulla minimappa
Ogni clone è visibile sulla minimappa solo aggiornato **ogni 30 secondi** (snapshot della sua posizione). Tra un aggiornamento e l'altro il giocatore non sa dove si è spostato.

### 8.5 Condizioni di fine partita
- **Vittoria:** numero di cloni vivi = 0 dopo che almeno il primo clone è stato ucciso. (Cioè: il giocatore uccide tutti i cloni esistenti, non ne restano in mappa.)
- **Game over:** numero di cloni vivi > 10 simultaneamente.

> **Nota implementativa:** tracciare separatamente "cloni vivi attualmente" e "cloni totali generati". La condizione di vittoria si valuta solo dopo che il primo clone è stato ucciso, per evitare vittoria istantanea a tempo zero.

---

## 9. Abilità (8 base, espandibili)

| # | Abilità | Effetto |
|---|---|---|
| 1 | Doppio salto | Secondo salto in aria. |
| 2 | Wall jump | Salto da parete verticale. |
| 3 | Corsa / Dash | Scatto orizzontale rapido. |
| 4 | Scudo | Tasto dedicato, blocca 1 colpo ogni X secondi (cooldown). |
| 5 | Arma a lungo raggio (debole) | Proiettile a basso danno, illimitato o con cooldown. |
| 6 | Schianto a terra | In aria, premendo giù → caduta veloce con danno ad area all'atterraggio. |
| 7 | Moltiplicatore monete 1.5× | Passivo: tutte le monete raccolte sono ×1.5. |
| 8 | Stop | Ferma per 2–3 secondi tutti i nemici nella stanza (cooldown lungo). |

**Suggerimenti di Claude per abilità extra (proposti, opzionali):**
- **Riflesso:** dopo un parry perfetto, il prossimo colpo del giocatore è critico.
- **Eco:** ogni 5° colpo nemico evitato genera 2 monete.
- **Risonanza:** l'arma a lungo raggio rimbalza una volta sui muri.
- **Phase:** brevissimo intangibile (~0.3 s) on-demand con cooldown lungo.

> Decisione finale sulle abilità extra: lasciarle commentate/feature-flag in `config.js` per attivarle in seguito.

---

## 10. Consumabili

### 10.1 I 4 base richiesti
| # | Consumabile | Effetto |
|---|---|---|
| 1 | Rallentatore di tempo | Per 10 s, nemici e cloni si muovono al 30% velocità; il giocatore al 100%. |
| 2 | Dispositivo di teletrasporto | Uso 1: piazza un'ancora alla posizione corrente. Uso 2: riattivandolo, teletrasporta il giocatore all'ancora. L'ancora persiste tra le stanze e tra le morti finché non viene consumata o ripiazzata. |
| 3 | Mini-piattaforma | Mentre sei a terra o in aria, piazza una piccola piattaforma temporanea sotto i piedi (durata es. 8 s). |
| 4 | Mimetizzazione | Per 10 s i nemici (ed eventualmente i cloni in modalità Hunting) non ti vedono né attaccano. In modalità Combat dei cloni: opzionale, suggerito **non** funzioni contro il clone in combat per non renderlo banale. |

### 10.2 Slot e UI
- 4 slot consumabili nell'HUD, mappati ai tasti 1/2/3/4.
- Ogni slot mostra icona + contatore numerico.

---

## 11. Minimappa

### 11.1 Comportamento
- A inizio run mostra **solo la cella centrale** (visibile), tutto il resto in fog of war.
- Ogni volta che il giocatore entra in una **nuova** cella, quella cella diventa visibile e una **linea colorata** la collega alla precedente, mostrando l'arco percorso.
- Le celle visitate restano permanentemente visibili.
- Le celle adiacenti a quelle visitate possono essere mostrate in "penombra" (solo l'esistenza del muro, non il contenuto) — opzionale, valutare in playtest.

### 11.2 Marker sulla minimappa
- Pallino per la posizione attuale del giocatore (realtime).
- Icone permanenti per **tutti** i POI scoperti: ogni NPC trovato, ogni miniboss avvistato, ogni checkpoint attivato (non solo l'ultimo). Una volta scoperti, i loro marker restano sempre visibili sulla minimappa per tutto il resto della run, anche se il giocatore lascia la stanza. Marker visivamente distinti per tipo (icona/colore differenti per Guaritore, Mistico, Armaiolo, Fabbro, miniboss, checkpoint).
- L'ultimo checkpoint **attivato** è marcato in modo speciale (es. icona evidenziata) per ricordare al giocatore dove respawnerà.
- Posizione dei cloni: aggiornata **ogni 30 s** (snapshot, non realtime).

### 11.3 UI
- Mini-versione sempre visibile in alto a destra (o angolo a scelta).
- Versione full-screen aprendo il tasto `M` (gioco resta in pausa? scelta UX: meglio NO, solo overlay semitrasparente, ma cloni continuano).

---

## 12. Checkpoint

- 5 checkpoint generati casualmente in stanze non speciali a inizio run.
- Si attivano al primo passaggio (animazione, suono, conferma visiva).
- Alla morte, respawn all'**ultimo** checkpoint attivato. Se nessuno è ancora stato attivato → respawn in cella centrale.
- Le stats del giocatore sono mantenute tra morti (vite ricaricate al massimo, arma/abilità/consumabili/monete invariati).
- I checkpoint non curano i nemici uccisi né resettano lo stato del labirinto.

---

## 13. Economia e bilanciamento (valori iniziali, da tunare)

| Elemento | Valore proposto |
|---|---|
| Drop monete da nemico base | 1–5 |
| Drop monete da miniboss | 50–150 |
| Costo cibo (1 unità) | 15 |
| Costo abilità | 80–250 (varia per abilità) |
| Costo consumabile | 25–60 |
| Costo upgrade arma L2 | 50 |
| Costo upgrade arma L3 | 120 |
| Costo upgrade arma L4 | 250 |
| Costo upgrade arma L5 | 500 |
| Costo upgrade super arma L2 | 150 |
| Costo upgrade super arma L3 | 400 |
| Vita bonus venduta dal Guaritore (slot extra) | 100 (rispettando cap globale di 10) |

> Tutti i valori in `config.js` per facilitare il tuning.

---

## 14. Stati di gioco e flusso

```
[Main Menu]
   └─> Start Run
        └─> Generate Maze
             └─> [Gameplay]
                  ├─> [Shop UI]   (pausa totale)
                  ├─> [Pause Menu] (pausa totale)
                  ├─> [Minimap full] (overlay, gioco continua)
                  ├─> Player Death → respawn @ checkpoint, +1 clone
                  ├─> Clones alive > 10 → [Game Over]
                  └─> Clones alive == 0 (≥1 ucciso) → [Victory]
```

---

## 15. Ordine di implementazione consigliato (milestone)

Per evitare che Claude Code si perda, suggerisco questo ordine. Ogni milestone deve essere giocabile/testabile.

### M1 — Skeleton tecnico
- Setup `index.html`, canvas, CSS base.
- Game loop con `requestAnimationFrame`, timestep fisso.
- Gestione input tastiera.
- Player rettangolare, fisica base (gravità, collisioni AABB con il pavimento).
- Una singola stanza statica hardcoded.

### M2 — Sistema stanze e transizioni
- Definizione struttura `Room` (uscite, piattaforme, nemici).
- Cambio stanza attraversando un'uscita → caricamento nuova stanza.
- Camera fissa per stanza.

### M3 — Generazione labirinto
- Algoritmo di generazione 9×9 con vincoli di connessione e gradi.
- Marcatura vicoli ciechi, posizionamento checkpoint, NPC, miniboss.
- Generazione interna delle stanze con vincolo di percorribilità delle uscite.

### M4 — Minimappa
- Fog of war, scoperta progressiva, linee di connessione.
- Marker player, checkpoint.

### M5 — Combattimento, vite, monete
- Arma mischia, hitbox, danni.
- Nemici base con IA semplici.
- HUD: vite, monete.
- Drop monete e pickup.

### M6 — NPC e shop
- 4 NPC con UI shop, pausa totale durante l'interazione.
- Acquisto vite, cibo, abilità, consumabili, upgrade arma.

### M7 — Abilità e consumabili
- Sistema modulare: ogni abilità è un modulo attivabile.
- 8 abilità base + 4 consumabili.
- Slot consumabili e tasti rapidi.

### M8 — Miniboss e vicoli ciechi
- Lock dell'uscita all'ingresso, unlock alla sconfitta.
- Drop ricompensa scelta casualmente tra monete, vite, abilità, consumabili.
- 4–6 archetipi di miniboss.
- Sistema di distribuzione random delle abilità tra Mistico e miniboss (§6.3).

### M9 — Cloni e IA
- Primo clone con stats massime, spawn in angolo.
- Pathfinding sul grafo delle stanze, modalità Hunting/Combat.
- Snapshot minimappa ogni 30 s.
- Generazione cloni successivi alla morte del giocatore con stats ereditate.
- Condizioni di vittoria/game over.

### M10 — Checkpoint e respawn
- Attivazione, persistenza tra morti, respawn corretto.

### M11 — Bilanciamento e polish
- Tuning numeri, feel del salto, knockback, screen shake.
- Audio placeholder (anche solo bip).
- Schermate di vittoria/sconfitta.

### M12 — Stile grafico (post-MVP)
- Sostituzione placeholder con sprite, animazioni, palette tematica (cappuccio + chitarra + cloni robotici).

---

## 16. Note tecniche e accorgimenti

- **RNG seedabile:** ogni run salva un seed; permette debug ("riproduci la stessa mappa") e replay. Esporlo in console e in URL `?seed=...`.
- **Pausa totale durante shop/menu:** un singolo flag `gameState.paused` letto da tutti i sistemi nel loop. Il timer dei cloni e il timer dello snapshot minimappa devono rispettarlo.
- **Performance:** il labirinto ha 81 stanze ma solo 1 è attiva alla volta (rendering). Tieni in memoria solo lo stato delle entità, non sprite/canvas duplicati.
- **Pathfinding cloni:** sul grafo macro (81 nodi), non sulla geometria interna. Quando un clone entra nella stanza del giocatore, passa al pathfinding micro (interno alla stanza) o a IA reattiva.
- **Collisioni:** AABB swept per evitare tunneling alle alte velocità (dash, schianto a terra).
- **Save state:** non richiesto in MVP (run singola in memoria). Eventualmente salvare run in `localStorage` come stretch goal.
- **Accessibilità:** rebinding tasti come stretch goal; scrivere `input.js` con mappa `action → keys[]` per supportarlo facilmente.
- **Test manuali da prevedere per ogni milestone:** scenari documentati in commenti o in un `/TESTING.md`.

---

## 17. Domande aperte (da decidere durante lo sviluppo)

1. La mimetizzazione funziona contro il clone in modalità Combat? (Suggerimento: si.)
2. I cloni possono raccogliere pickup (monete, vite, abilità)? (Suggerimento: no, sono già maxati o ereditano stats.)
3. I cloni possono morire tra loro o danneggiarsi a vicenda? (Suggerimento: no, ignorano gli altri cloni.)
4. Cosa succede se 2 cloni entrano nella stessa stanza del giocatore? (Suggerimento: entrambi in modalità Combat; tetto a 2 contemporanei nella stessa stanza per leggibilità.)
5. La minimappa full-screen mette in pausa il gioco? (Suggerimento: no, solo l'HUD.)
6. Il timer dei 30 s dei cloni si resetta tra una run e l'altra ovviamente, ma anche durante le pause? (Suggerimento: sì, durante pause/shop si congela.)
7. Quanto dura il game-over screen prima di consentire restart? (UX, da playtest.)

---

## 18. Brief stilistico (riferimento, non vincolante per la fase tecnica)

- **Protagonista:** ragazzo incappucciato, volto coperto. Ambientazione: città underground (sotterranei, neon, graffiti).
- **Arma:** chitarra usata come spada (animazione swing, possibile suono "power chord" all'attacco).
- **Cloni:** copie robotiche del protagonista, con dettagli meccanici visibili (occhi rossi, articolazioni esposte). I cloni più "vecchi" (creati per primi) potrebbero avere skin più consumate.
- **Tono:** cyberpunk-grunge, palette desaturata con accenti neon (magenta, ciano, giallo acido).
- **Audio (futuro):** chitarra distorta, lo-fi industrial, beat lenti.

> Questa sezione è puramente narrativa: in MVP usare placeholder geometrici colorati.

---

## 19. Definition of Done per l'MVP

L'MVP è completo quando un giocatore può:

1. Avviare una nuova run e vedere un labirinto generato proceduralmente.
2. Esplorare 9×9 stanze, scoprire la minimappa progressivamente.
3. Combattere nemici, raccogliere monete, acquistare presso i 4 NPC.
4. Sbloccare almeno 6 delle 8 abilità e usarle.
5. Usare i 4 consumabili.
6. Affrontare i miniboss nei vicoli ciechi.
7. Vedere il primo clone muoversi nel labirinto e affrontarlo.
8. Morire, respawnare al checkpoint, e vedere apparire un nuovo clone con le sue stats.
9. Vincere uccidendo tutti i cloni o perdere se i cloni vivi superano 10.
10. Restartare la run e ottenere un labirinto diverso.

---

## 20. Prompt per Claude Code, milestone per milestone

> Usare questi prompt **uno alla volta**, in ordine. Prima di ogni prompt, assicurarsi che il working directory contenga il file di spec (questo documento) accessibile a Claude Code, idealmente nominato `SPEC.md` nella root del progetto. Tra una milestone e l'altra: testare manualmente, fare commit, poi passare al prompt successivo.

### Prompt iniziale (setup del progetto)

```
Leggi attentamente il file SPEC.md nella root del progetto. È la specifica completa
di un gioco metroidvania 2D roguelite browser-based che dobbiamo implementare in
HTML/CSS/JavaScript vanilla, senza framework e senza backend.

Per ora non scrivere codice. Dopo aver letto la spec:
1. Riassumimi in massimo 10 punti la tua comprensione del progetto.
2. Segnalami eventuali ambiguità o contraddizioni che hai notato.
3. Proponimi la struttura di file iniziale che vuoi adottare (puoi seguire quella
   suggerita nella §2 della spec o proporre alternative motivate).
4. Confermami che procederai per milestone come indicato nella §15, una alla volta,
   fermandoti dopo ciascuna per il mio test manuale prima di passare alla successiva.

Aspetta la mia conferma prima di scrivere qualsiasi codice.
```

### Prompt M1 — Skeleton tecnico

```
Implementa la milestone M1 della spec (§15): skeleton tecnico.

Obiettivo: una pagina HTML che apre un canvas a schermo intero, con un game loop a
timestep fisso (60 Hz logico) e rendering interpolato via requestAnimationFrame.
Un personaggio rettangolare (placeholder) si muove a sinistra/destra e salta in una
singola stanza statica con pavimento e pareti, fisica AABB con gravità.

Crea solo i file necessari per questa milestone, niente roba in più.

Al termine spiegami brevemente cosa hai fatto e come testare.
```

### Prompt M2 — Stanze e transizioni

```
Implementa la milestone M2 della spec (§15): sistema stanze e transizioni.

- Definisci la struttura dati `Room` (con uscite N/S/E/O, lista piattaforme, lista
  spawn nemici/pickup anche se per ora vuote).
- Crea 3-4 stanze hardcoded di test, con uscite diverse, collegate manualmente.
- Implementa il cambio stanza quando il giocatore attraversa un'uscita: la stanza
  viene scaricata, quella nuova caricata, il giocatore spawna in posizione coerente
  (entra da Nord → cade dall'alto, ecc.).
- Camera fissa per stanza, niente scrolling.

Non toccare nemici/combattimento/minimap, non sono in questa milestone.
```

### Prompt M3 — Generazione labirinto

```
Implementa la milestone M3 della spec (§15): generazione procedurale del labirinto.

Riferimenti nella spec: §3 (mappa), §4 (stanze interne).

Requisiti:
- Generatore 9×9 con spanning tree dal centro + archi extra per la distribuzione
  dei gradi indicata in §3.2.
- Etichetta i vicoli ciechi (1 sola uscita).
- Posiziona casualmente: 5 checkpoint, 4 NPC (uno per tipologia), miniboss nei vicoli
  ciechi, rispettando i vincoli di §3.4.
- Genera l'interno di ogni stanza con il vincolo di percorribilità delle uscite alte
  con i soli salti base (§4.3): valida con un BFS sulle piattaforme.
- RNG seedabile via parametro URL `?seed=...` (§16).

Aggiungi un comando di debug (es. tasto F1) che apri un overlay che mostra il grafo
del labirinto completo, utile per testare la generazione.

Sostituisci le stanze hardcoded di M2 con quelle generate.
```

### Prompt M4 — Minimappa

```
Implementa la milestone M4 della spec (§15): minimappa con fog of war.

Riferimenti: §11.

- Mini-versione sempre visibile in alto a destra del canvas (HTML overlay o disegnata
  sul canvas, scegli tu motivando).
- Inizio run: solo cella centrale visibile, resto in fog.
- Visitando una nuova cella: si rivela e viene tracciata la linea colorata che la
  collega alla cella precedente.
- Marker per: posizione corrente del giocatore, ultimo checkpoint attivato,
  NPC scoperti, miniboss scoperti.
- Tasto M: apre versione full-screen come overlay semitrasparente; il gioco
  CONTINUA sotto (no pausa).

Posizione cloni e snapshot ogni 30 s NON in questa milestone (verranno in M9).
```

### Prompt M5 — Combattimento, vite, monete

```
Implementa la milestone M5 della spec (§15): combattimento base, vite, economia.

Riferimenti: §5.4, §6.1, §13.

- Arma mischia del giocatore con hitbox, animazione placeholder, danno dipendente
  dal livello arma (per ora livello 1, gli upgrade arrivano in M6).
- 4 tipi di nemici base (Walker, Flyer, Shooter, Charger) con IA semplici.
- Sistema vite del giocatore (3 di partenza, max 10), invulnerabilità post-hit,
  morte e respawn momentaneo al centro (per ora; checkpoint veri in M10).
- Drop monete dai nemici, pickup raccoglibili.
- HUD: vite (icone cuore o simile) e contatore monete.
- I valori numerici (HP, danno, drop, ecc.) li scegli tu in `config.js` motivando
  brevemente le scelte.
```

### Prompt M6 — NPC e shop

```
Implementa la milestone M6 della spec (§15): NPC e shop.

Riferimenti: §7, §13.

- 4 NPC distinti (Guaritore, Mistico, Armaiolo, Fabbro) nelle posizioni generate
  in M3, ognuno con un'icona/colore distintivo.
- Interazione con tasto E: apre UI shop come overlay.
- Pausa TOTALE durante lo shop (§7.4): tutti i sistemi (nemici, fisica, timer,
  proiettili) leggono `gameState.paused` e si fermano.
- Shop: lista oggetti acquistabili con prezzo, conferma acquisto, deduzione monete,
  feedback se monete insufficienti.
- Inventario randomico per run (§7.2): genera lo stock di ogni NPC a inizio run.
- Cap globale di 10 vite tracciato in `gameState` (§7.3): il Guaritore non può
  vendere vite oltre il cap.

Le abilità acquistate dal Mistico per ora vanno solo aggiunte all'inventario
del giocatore: l'effetto pratico delle abilità arriva in M7.
```

### Prompt M7 — Abilità e consumabili

```
Implementa la milestone M7 della spec (§15): sistema abilità e consumabili.

Riferimenti: §9, §10.

- Sistema modulare in `/src/systems/abilities.js`: ogni abilità è un modulo con
  hooks (es. onJumpInput, onUpdate, passive modifiers). Easy da estendere in
  futuro con le abilità extra suggerite in §9.
- Implementa le 8 abilità base con effetti coerenti con la spec.
- 4 consumabili (§10.1) con tasti rapidi 1/2/3/4 e contatori nell'HUD.
- Slot consumabili e logica di uso/decremento.
- Il dispositivo di teletrasporto ha 2 stati (ancora piazzata sì/no): gestisci la
  UI di feedback chiaramente.
```

### Prompt M8 — Miniboss e vicoli ciechi

```
Implementa la milestone M8 della spec (§15): miniboss.

Riferimenti: §6.

- Quando il giocatore entra in un vicolo cieco, l'uscita si chiude (visivamente e
  funzionalmente, sia per giocatore sia per cloni).
- 4-6 archetipi di miniboss con pattern di attacco distinti (li progetti tu).
- Sconfitto il miniboss: uscita riaperta + drop di UNA ricompensa scelta randomicamente
  tra monete, vita, abilità, consumabile.
- Implementa il sistema di distribuzione random delle abilità (§6.3): a inizio run,
  per ogni abilità del gioco, la pianti random nello stock del Mistico o come
  ricompensa di un miniboss specifico. Verifica completabilità (almeno N abilità
  totali raggiungibili — N è una costante in config.js, scegli tu un valore
  ragionevole motivandolo).
```

### Prompt M9 — Cloni e IA

```
Implementa la milestone M9 della spec (§15): cloni e IA. Questa è la milestone
più complessa: procedi con calma, fai test intermedi se serve.

Riferimenti: §8.

- Primo clone con stats massime (§8.1), spawn in 1 dei 4 angoli del labirinto a
  inizio run.
- Pathfinding sul GRAFO delle stanze (BFS/A* sul grafo macro a 81 nodi) verso la
  cella corrente del giocatore. NON shortest path puro: introduci rumore/peso
  random secondo §8.3 modalità Hunting.
- Velocità di traversata stanza: 1 cella ogni 6-10 secondi (parametrabile).
- Quando il clone entra nella stanza del giocatore: passa a modalità Combat (§8.3.B),
  IA reattiva con tutte le sue abilità e consumabili infiniti, niente cibo.
- Snapshot della posizione dei cloni sulla minimappa ogni 30 secondi (§8.4); il
  timer si congela durante pause/shop.
- Cloni successivi (§8.2): alla morte del giocatore, spawna un nuovo clone con
  stats = stats del giocatore al momento della morte (snapshot di vite max, livello
  arma, abilità, consumabili). Cella di spawn random, mai quella del giocatore.
- Condizioni di fine run (§8.5): vittoria se cloni vivi = 0 dopo che almeno il
  primo clone è stato ucciso; game over se cloni vivi > 10.

Implementa anche le scelte di default sulle questioni aperte (§17): mimetizzazione
funziona contro clone in Combat, cloni si ignorano tra loro, infiniti cloni
contemporaneamente nella stessa stanza.
```

### Prompt M10 — Checkpoint e respawn

```
Implementa la milestone M10 della spec (§15): checkpoint.

Riferimenti: §12.

- I 5 checkpoint generati in M3 ora hanno una hitbox di attivazione: il primo
  passaggio li accende (visivo + suono placeholder).
- Alla morte del giocatore: respawn all'ULTIMO checkpoint attivato (non al centro
  come in M5). Se nessuno è stato attivato, respawn al centro.
- Le stats si mantengono tra morti tranne le vite, che si rigenerano al massimo.
- Verifica che la generazione del nuovo clone (da M9) avvenga correttamente al
  respawn.
```

### Prompt M11 — Bilanciamento e polish

```
Implementa la milestone M11 della spec (§15): bilanciamento e polish.

- Tuning di tutti i numeri in config.js basato su un playtest di 30+ minuti che
  documenterai brevemente in `BALANCING.md` (cosa hai cambiato e perché).
- Feel del salto: coyote time (~6 frame), jump buffer (~6 frame), gravity scaling
  in fall.
- Knockback su hit nemico, screen shake leggero su impatti pesanti (schianto a
  terra, miniboss).
- Audio placeholder: anche solo bip generati con WebAudio API, suoni distinti
  per: salto, attacco, hit, pickup, morte, vittoria.
- Schermate di Vittoria, Game Over e Pausa con UI pulita e tasto "Nuova Run".
```

### Prompt M12 — Stile grafico

```
Implementa la milestone M12 della spec (§15): pass grafico.

Riferimenti: §18.

Sostituisci i placeholder geometrici con sprite/animazioni semplici coerenti con
il brief stilistico (cyberpunk-grunge, cappuccio + chitarra, cloni robotici).
Puoi:
- Generare gli sprite proceduralmente con canvas (forme + filtri),
- Oppure creare semplici sprite sheet PNG nella cartella /assets,
- Oppure usare CSS/SVG per gli elementi UI.

Mantieni leggibilità del gameplay sopra ogni cosa: silhouette chiare, contrasto
forte tra giocatore/nemici/cloni, palette desaturata con accenti neon.

Documenta in `STYLE.md` le scelte fatte.
```

### Prompt di rifinitura finale (post-M12)

```
Il gioco è completo secondo i criteri di Definition of Done (§19 di SPEC.md).

Fai un'ultima passata:
1. Verifica che tutti i punti della §19 siano effettivamente soddisfatti.
2. Controlla che ogni costante numerica importante sia in config.js (no magic
   numbers sparsi).
3. Verifica che non ci siano warning in console durante una partita normale.
4. Aggiungi un README.md con: come avviare il gioco (server statico), comandi
   di tastiera, link al seed corrente e al replay.
5. Segnalami eventuali bug residui o miglioramenti che vorresti fare.
```

---

*Fine documento.*
