var audioContext = null;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var currentTick = 0;        // What tick is currently last scheduled?
var tempo = 60.0;           // tempo (in beats per minute)
var tempo1 = 60;            // tempo (in beats per minute)
var tempo2 = 60;            // tempo (in beats per minute)
var duration = 60;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextTickTime = 0.0;     // when the next tick is due.
var halfNum = 0;            // bar index, starting from 0
var mode = "";              // grid, list, up or down
var resolution = 16;        // how many notes in two beats

var started;                // when starting an acceleration of en exercise
var nextBeatTime = 0.0;    // when the next click is due.

var noteLength = 0.05;      // length of "beep" (in seconds)
var timerWorker = null;     // The Web Worker used to fire timer messages
var storage = window.localStorage;
var list = null;

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
            if (mode == "grid up") {
                if (resolution == 2) resolution = 3;
                else if (resolution == 3) resolution = 4;
                else if (resolution == 4) resolution = 6;
                else if (resolution == 6) resolution = 8;
                else if (resolution == 8) resolution = 12;
                else if (resolution == 12) {
                    resolution = 16;
                    mode = "grid down";
                }
            } else {
                if (resolution == 16) resolution = 12;
                else if (resolution == 12) resolution = 8;
                else if (resolution == 8) resolution = 6;
                else if (resolution == 6) resolution = 4;
                else if (resolution == 4) resolution = 3;
                else if (resolution == 3) {
                    resolution = 2;
                    mode = "grid up";
                }
            }
            var score = document.getElementById("score");
            score.innerHTML = values[resolution];
        }
    }
}

function nextBeat() {

    var beat = 60.0 / tempo;
    nextBeatTime += beat;

    var elapsed = audioContext.currentTime - started;
    var dev = (tempo2-tempo1) / duration * elapsed;

    if (mode == "list up") {
        tempo = tempo1 + dev;
        if (tempo >= tempo2) {
            mode = "list down";
            started = audioContext.currentTime;
        }
    } else {
        tempo = tempo2 - dev;
        if (tempo <= tempo1) {
            mode = "list up";
            started = audioContext.currentTime;
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

function scheduleBeat( time ) {
    var osc = audioContext.createOscillator();
    osc.connect( audioContext.destination );
    osc.frequency.value = 440.0;
    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    if (mode.substring(0, 4) == "grid") {
        while (nextTickTime < audioContext.currentTime + scheduleAheadTime ) {
            scheduleNote( currentTick, nextTickTime );
            nextTick();
        }
    } else {
        while (nextBeatTime < audioContext.currentTime + scheduleAheadTime ) {
            scheduleBeat( nextBeatTime );
            nextBeat();
        }
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
        mode = "grid up";
        nextTickTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "stop";
    } else {
        timerWorker.postMessage("stop");
        return "play";
    }
}

function playThis(event) {
    var children = event.originalTarget.parentElement.childNodes;
    tempo1 =   parseInt(children[2].value);
    tempo2 =   parseInt(children[4].value);
    duration = parseInt(children[6].value);

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
        tempo = tempo1;
        started = audioContext.currentTime;
        mode = "list up";
        nextBeatTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "×";
    } else {
        timerWorker.postMessage("stop");
        return ">";
    }
}

function addEmpty() {
    var data = {'title': "le titre",
                'tempo1': 80, 'tempo2': 100, 'duration': 60};
    add(data);
}

function numElem(data, key) {
    var elt = document.createElement("input");
    elt.type = 'text';
    elt.value = data[key];
    elt.size = 3;
    elt.className = 'num-elem';
    return elt
}

function sort() {
    var clicksArray = Array.prototype.slice.call(list.childNodes, 0);
    clicksArray.sort(compareClicks);
    list.innerHTML = '';
    clicksArray.forEach(function (elt) {list.append(elt)});
}

function compareClicks(a, b) {
    if (a.childNodes[1].value < b.childNodes[1].value) return -1;
    if (a.childNodes[1].value > b.childNodes[1].value) return 1;
    return 0
}

function add(data) {
    // container
    var item = document.createElement("li");
    item.className = "listitem";
    // play button
    var play = document.createElement("span");
    play.className = "play2";
    play.innerHTML = ">";
    play.onclick = function(event) {play.innerText = playThis(event);};
    item.appendChild(play);
    // title
    var title = document.createElement("input");
    title.type = 'text';
    title.value = data['title'];
    title.size = 25;
    item.appendChild(title);
    // tempi and duration
    item.appendChild(numElem(data, 'tempo1'));
    item.insertAdjacentHTML('beforeend', " to ");
    item.appendChild(numElem(data, 'tempo2'));
    item.insertAdjacentHTML('beforeend', " in ");
    item.appendChild(numElem(data, 'duration'));
    item.insertAdjacentHTML('beforeend', "s");
    // remove button
    var remove = document.createElement("span");
    remove.className = "remove";
    remove.innerHTML = "-";
    remove.onclick = suppr;
    item.appendChild(remove);
    // add container to the list
    list.prepend(item);
}

function suppr(event) {
    event.originalTarget.parentElement.remove();
}

function buildExport() {
    var out = "";
    list.childNodes.forEach(function (elt) {
        var children = elt.childNodes;
        title  =   children[1].value;
        tempo1 =   children[2].value;
        tempo2 =   children[4].value;
        duration = children[6].value;
        out += title + ": " + tempo1 + ", " + tempo2 + ", " + duration + "\n";
    });
    return out.trim();
}

function _save() {
    localStorage.setItem('clicks', buildExport());
    alert("Saved to this browser!");
}

function parseImport(str) {
    var clicks = [];
    str.trim().split('\n').forEach(function (elt) {clicks.push(elt)});
    clicks.reverse();  // because our add function prepends
    clicks = clicks.map(function (elt) {
        var s = elt.split(':');
        var title = s[0].trim();
        var tempoArray = s[1].split(',');
        var tempo1 =   tempoArray[0].trim();
        var tempo2 =   tempoArray[1].trim();
        var duration = tempoArray[2].trim();
        return {'title':  title,
                'tempo1': tempo1,
                'tempo2': tempo2,
                'duration':  duration};});
    clicks.map(function (elt) {
        add(elt);
    });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    let fr = new FileReader();
    fr.onload = x => resolve(fr.result);
    fr.readAsText(file);
});}

function _import() {
    if (confirm("This will erase your clicks.")) {
        document.getElementById('selectedFile').click();
        alert("Now save to browser if needed.");
    }
}
async function doImport(inputElement) {
    list.innerHTML = "";
    var content = await readFile(inputElement.files[0]);
    parseImport(content);
}

function _export() {
    // https://ourcodeworld.com/articles/read/189/how-to-create-a-file-and-generate-a-download-with-javascript-in-the-browser-without-a-server
    var date = new Date().toJSON().slice(0, 10).replace(/-/g, '');
    var element = document.createElement('a');
    element.setAttribute('href',
        'data:text/plain;charset=utf-8,' + encodeURIComponent(buildExport()));
    element.setAttribute('download', date + "_clicklist.txt");
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function init(){

    list = document.getElementById("list");
    // fetch data from storage
    var localData = localStorage.getItem('clicks');
    if (localData) {
        parseImport(localData.trim());
    } else {
        var data = {'title': "Click + or import to add clicks",
                    'tempo1': 80, 'tempo2': 100, 'duration': 60};
        add(data);
    }

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // if we wanted to load audio files, etc., this is where we should do it.

    // Build a worker from an anonymous function body
    var blobURL = URL.createObjectURL( new Blob([ '(',
    function(){
        var timerID = null;
        var interval = 100;

        self.onmessage = function(e){
            if (e.data == "start") {
                console.log("starting");
                timerID = setInterval(
                        function(){postMessage("tick");},
                        interval);
            }
            else if (e.data.interval) {
                console.log("setting interval");
                interval = e.data.interval;
                console.log("interval = "+interval);
                if (timerID) {
                    clearInterval(timerID);
                    timerID = setInterval(function(){postMessage("tick");},interval)
                }
            }
            else if (e.data == "stop") {
                console.log("stopping");
                clearInterval(timerID);
                timerID = null;
            }
        };

        postMessage('hi there');
    }.toString(),
    ')()'], {type: 'application/javascript'}));

    timerWorker = new Worker(blobURL);
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

