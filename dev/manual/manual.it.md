# Manuale dell'AoIP Bandwidth Planner

L'AoIP Bandwidth Planner ti aiuta a pianificare una rete audio Dante / AES67: disegni dispositivi, switch e collegamenti, descrivi i flussi audio e vedi quanta parte di ogni collegamento usano. È una web app (PWA) gratuita di OnAir Garage che funziona offline dopo la prima visita. Tutto gira nel tuo browser e non viene inviato nulla da nessuna parte.

## Aprire e installare

Apri il planner su `https://onairgarage.com/apps/aoip-bandwidth-planner/` (la pagina dello strumento è `https://onairgarage.com/tools/aoip-bandwidth-planner/`). Per usarlo non si installa nulla. Puoi anche installarlo come app:

- **Chrome, Edge e altri browser Chromium**: premi il pulsante *Installa app*.
- **iPhone e iPad (Safari)**: tocca il pulsante Condividi, poi «Aggiungi alla schermata Home».
- **Safari su Mac**: menu File, poi «Aggiungi al Dock».

L'app si apre sempre in inglese; cambia lingua nell'intestazione (English, Italiano, Español) e la scelta viene ricordata. Il tema può essere chiaro, scuro o seguire il sistema.

## Disegnare la rete

In *Dispositivi e switch* costruisci la rete:

1. Premi **Aggiungi** per aggiungere un **dispositivo** o uno **switch** (dagli un *Nome* e scegli il *Tipo*). Il numero di nodi è limitato («Limite raggiunto» te lo dice).
2. Usa **Collega a** e **Velocità del link** per unire un nodo a un altro con un collegamento da 100 Mbps, 1 Gbps o 10 Gbps.
3. Ogni collegamento appartiene alla rete **primaria** o a quella **secondaria** (la scelta *Rete*): è così che si disegna la ridondanza Dante.
4. Trascina i nodi sul diagramma schematico (o spostali con le frecce); *Disposizione automatica* li ordina. **Rimuovi** elimina un nodo.

## Descrivere i flussi

In *Flussi* premi **Aggiungi flusso** (serve prima almeno un dispositivo). Ogni flusso ha:

- un **Nome**, un dispositivo **Sorgente** e i **Ricevitori** (senza nessun ricevitore selezionato un flusso non trasporta ancora nulla);
- la **Consegna**: unicast (un flusso verso ogni ricevitore) o multicast;
- il numero di **Canali**, la **Frequenza di campionamento** (44,1, 48 o 96 kHz) e la **Profondità di bit**;
- il **Modello**: **AES67 (RTP)** o **Dante (stima)**;
- le **Copie**, per ripetere flussi identici (per esempio molti dispositivi con la stessa configurazione), e, per Dante, **Ridondante**: lo stesso audio viene inviato anche sulla rete secondaria, e viene instradato e contato separatamente su ciascuna rete.

Per **AES67** scegli anche il **Tempo di pacchetto** (125 µs, 250 µs, 333 µs, 1 ms per default, 4 ms, oppure un numero personalizzato di campioni per pacchetto) e i **Canali per stream**; le dimensioni a 16 e 24 bit sono calcolate. **Dante** è una **stima** scalata dalle cifre che Audinate pubblica (il formato dei pacchetti di Dante non è pubblico), solo per 24 bit. *Dettagli del calcolo* mostra come è stata ottenuta la cifra di un flusso. *Duplica* copia un flusso; *Rimuovi* lo elimina.

## Leggere i risultati

- Ogni collegamento mostra **due barre**, una per direzione (i collegamenti sono full duplex), riempite di segmenti colorati, uno per flusso, con un segno alla **soglia di sicurezza**. Sopra la soglia un collegamento diventa ambra, sopra la sua capacità rosso.
- Seleziona un collegamento nel diagramma o nell'elenco: *Dettagli del link* mostra la sua capacità e, per ogni direzione, i flussi che lo usano, con Mbps e pacchetti al secondo.
- **Instradamento**: i flussi unicast vengono inviati una volta per ricevitore lungo il percorso più breve; i flussi multicast vengono inviati una volta per collegamento, o solo verso i loro ricevitori (*IGMP snooping* attivo) oppure inondando ogni collegamento raggiungibile dalla sorgente (spento).
- *Totale sul link più carico* dà il carico più alto del piano.

## Impostazioni e piani

In *Impostazioni*: la **Soglia di sicurezza** (70 % per default: Audinate consiglia di tenere il traffico audio sotto il 70 % di ogni link), **Conta preambolo e spazio tra i frame** (carico alla velocità di linea), il **Tag VLAN 802.1Q** (aggiunge 4 byte a ogni pacchetto AES67) e l'**IGMP snooping**.

In *Piano*: il piano viene **salvato in automatico solo su questo dispositivo**. **Esporta JSON** lo salva in un file e **Importa JSON** ne carica uno (dopo che confermi di sostituire il piano attuale). **Carica un esempio** ne offre tre: un piccolo studio, una stazione radio e una rete Dante ridondante.

## Lingua, tema e privacy

La lingua e il tema vengono ricordati sul dispositivo. Tutto gira nel browser, i font sono serviti in locale e non viene inviato nulla da nessuna parte. Un piccolo riquadro mancia in fondo ha il salvadanaio del sito e un link alla pagina di sostegno di onairgarage.com nella tua lingua in una nuova scheda; dentro il planner non viene mai chiesto nulla.

## Aggiornamenti

Quando una nuova versione è pronta, un avviso «aggiornamento disponibile» offre di ricaricare. Ignorarlo lascia semplicemente in funzione la versione attuale.

## Limiti

- **Solo traffico audio**: il clock (PTP), la scoperta, il controllo e altro traffico non vengono contati, né QoS, latenza o capacità degli switch.
- IPv4, Ethernet senza tag a meno che l'opzione VLAN sia attiva, velocità di linea nominali, un solo collegamento tra due nodi.
- Dove esistono due percorsi si usa il più breve (si assume lo spanning tree; un anello viene segnalato).
- Gli stream AES67 vengono contati solo sulla rete primaria; gli schemi di ridondanza AES67 (come SMPTE ST 2022-7) non sono modellati.
- Alcuni dispositivi portano meno canali per flusso a frequenze di campionamento alte: non è modellato.
- Le cifre Dante sono stime. Il planner dimensiona un progetto; non sostituisce una cattura di rete.

## Risoluzione dei problemi

| Problema | Cosa fare |
|---|---|
| «Limite raggiunto» aggiungendo un nodo | Il piano ha il numero massimo di dispositivi e switch: rimuovine uno prima. |
| Un flusso non trasporta nulla | Seleziona la sua sorgente e almeno un ricevitore («Nessun ricevitore selezionato»). |
| Un collegamento è rosso | I flussi superano la sua capacità: usa un collegamento più veloce, meno canali, il multicast o un altro percorso. |
| Il file importato viene rifiutato | «Questo file non è un piano valido»: importa un JSON esportato da questo planner. |
| Il pulsante *Installa app* non c'è | Il browser potrebbe non offrirlo: su iPhone, iPad e Safari per Mac usa i passi del capitolo Aprire e installare. |

## Contatti

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Pagina dello strumento: `https://onairgarage.com/tools/aoip-bandwidth-planner/`. Codice sorgente e release: `https://github.com/djgragra/aoip-bandwidth-planner`. Licenza: MIT © 2026 Graziano Melzi.
