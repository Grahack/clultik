var audioContext = null;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var currentTick = 0;        // What tick is currently last scheduled?
var tempo = 60.0;           // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextTickTime = 0.0;     // when the next tick is due.
var halfNum = 0;            // bar index, starting from 0
var goOrReturn = "go";      // increasing resolution or decreasing?
var resolution = 16;         // how many notes in two beats
var noteLength = 0.05;      // length of "beep" (in seconds)
var timerWorker = null;     // The Web Worker used to fire timer messages

var values = [,,
              "quarters",         // 2
              "quarter triplets", // 3
              "eights",,          // 4
              "eight triplets",,  // 6
              "sixteenths",,,,    // 8
              "sextuplets",,,,    // 12
              "32ths"]            // 16


function nextTick() {
    // a tick is a 48th of two beats since we need
    // - 32th notes (8th of a beat, so 16 in a half note)
    // - triplets (of quarters and sextuplets)
    var tick = 2 * (60.0 / tempo) / 48;
    nextTickTime += tick;

    currentTick++;
    if (currentTick == 48) {
        currentTick = 0;
        halfNum++;
        if (halfNum == 4) {
            halfNum = 0;
            if (goOrReturn == "go") {
                if (resolution == 2) resolution = 3;
                else if (resolution == 3) resolution = 4;
                else if (resolution == 4) resolution = 6;
                else if (resolution == 6) resolution = 8;
                else if (resolution == 8) resolution = 12;
                else if (resolution == 12) {
                    resolution = 16;
                    goOrReturn = "return";
                }
            } else {
                if (resolution == 16) resolution = 12;
                else if (resolution == 12) resolution = 8;
                else if (resolution == 8) resolution = 6;
                else if (resolution == 6) resolution = 4;
                else if (resolution == 4) resolution = 3;
                else if (resolution == 3) {
                    resolution = 2;
                    goOrReturn = "go";
                }
            }
            var score = document.getElementById("score");
            score.innerHTML = values[resolution];
        }
    }
}

function scheduleNote( tickNumber, time ) {

    // handle the note
    if (!(resolution * tickNumber % 48 == 0)) return;

    // create an oscillator
    var osc = audioContext.createOscillator();
    osc.connect( audioContext.destination );
    if (tickNumber % 48 == 0 && halfNum % 2 == 0)
        osc.frequency.value = 880.0;
    else
        osc.frequency.value = 440.0;

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextTickTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( currentTick, nextTickTime );
        nextTick();
    }
}

function play() {
    if (!unlocked) {
      // play silent buffer to unlock the audio
      var buffer = audioContext.createBuffer(1, 1, 22050);
      var node = audioContext.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      unlocked = true;
    }

    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        currentTick = 0;
        halfNum = 0;
        resolution = 2;
        goOrReturn == "go";
        nextTickTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "stop";
    } else {
        timerWorker.postMessage("stop");
        return "play";
    }
}

function init(){

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // if we wanted to load audio files, etc., this is where we should do it.

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

