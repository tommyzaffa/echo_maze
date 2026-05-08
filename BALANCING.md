# Balancing M11

Questo pass raccoglie il tuning fatto per M11. I valori sono pensati per una
run lunga di verifica: il gioco ora e piu permissivo sugli input, ma un po piu
secco nella caduta e negli impatti.

## Movimento

- `PLAYER.MOVE_SPEED`: 180 -> 188. Il passo base era leggermente trattenuto
  rispetto alla densita attuale di stanze, nemici e pickup.
- `PLAYER.RUN_SPEED`: 260 -> 272. La corsa resta una ricompensa utile senza
  rendere inutili scatto e teletrasporto.
- `PLAYER.JUMP_VELOCITY`: 540 -> 552. Piccolo margine extra per piattaforme e
  scale generate proceduralmente.
- `PLAYER.COYOTE_TIME`: 0.10 s. Circa 6 frame a 60 fps: permette di saltare
  appena dopo aver lasciato il bordo.
- `PLAYER.JUMP_BUFFER_TIME`: 0.10 s. Circa 6 frame: permette di premere salto
  poco prima di atterrare.
- `PLAYER.FALL_GRAVITY_SCALE`: 1.28. La salita resta leggibile, la discesa
  diventa piu responsiva.
- `PLAYER.JUMP_CUT_VELOCITY`: 200 -> 215. Il saltino corto e un filo meno
  brusco, ma resta controllabile.

## Combattimento

- `PLAYER.DOWN_ATTACK_BOUNCE_VELOCITY`: 445 -> 470. Il rimpallo del colpo in
  basso ora separa meglio il player dal nemico.
- `PLAYER.HIT_KNOCKBACK_X/Y/TIME`: aggiunti per spostare leggermente i nemici
  colpiti dall'arma base. I miniboss ricevono una versione ridotta per non
  rompere i pattern.
- `FEEDBACK.SHAKE_*`: aggiunti valori centralizzati per screen shake leggero,
  pesante e hit su miniboss.

## Feedback

- Audio placeholder WebAudio distinto per salto, attacco, hit, pickup, morte,
  vittoria e checkpoint.
- Screen shake su danno subito, schianto a terra, hit miniboss, game over e
  vittoria.
- Overlay puliti per Pausa, Vittoria e Game Over con comando `N` per nuova run.

## Note di verifica

Questo file documenta il pass di tuning implementato in M11. Prima del freeze
del MVP conviene fare una vera sessione umana continuativa da 30+ minuti,
segnando seed, stanze problematiche e morti considerate ingiuste.
