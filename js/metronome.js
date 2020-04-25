var audioContext = null;
var locStorageOK = false;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var currentTick = 0;        // What tick is currently last scheduled?
var tempo = 60.0;           // tempo (in beats per minute)
var tempo1 = 60;            // tempo (in beats per minute)
var tempo2 = 60;            // tempo (in beats per minute)
var sound = 'Bip';
var duration = 60;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextTickTime = 0.0;     // when the next tick is due.
var halfNum = 0;            // half note index, starting from 0
var mode = "grid";          // grid, list up or list down
var resolutions = [2, 3]    // array of how many notes in two beats
/* autres idées pour le code :
Q   4   N
Q3  43 3N
E   8   C
E3  3   T
S  16   D
S3 163  S
Th 32   Tr
*/

var started;                // when starting an acceleration of en exercise
var nextBeatTime = 0.0;     // when the next click is due.

var noteLength = 0.05;      // length of "beep" (in seconds)
var timerWorker = null;     // The Web Worker used to fire timer messages
var storage = window.localStorage;
var score = null;
var score2 = null;
var list = null;
var popup = null;
var svg = null;
var w = 800;
var h = 600;
var dot = null;
var tempoLabel = null;
var tempoLabel1 = null;
var tempoLabel2 = null;
var tempoLabel1Bis = null;

var values = [,,
              "quarters",         // 2
              "quarter triplets", // 3
              "eights",,          // 4
              "eight triplets",,  // 6
              "sixteenths",,,,    // 8
              "sextuplets",,,,    // 12
              "32ths"]            // 16

/* from https://webaudioapi.com/static/js/shared.js */
// Start off by initializing a new context.
context = new (window.AudioContext || window.webkitAudioContext)();

// shim layer with setTimeout fallback
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback) {
    window.setTimeout(callback, 1000 / 60);
  };
})();

function soundChange(event) {
    sound = event.target.value.split(' ')[0];
    console.log("Switching to " + sound);
}

function filter(event) {
    var f = event.target.value.toLowerCase().trim();
    console.log("Filtering with " + f);
    var clicksArray = Array.prototype.slice.call(list.childNodes, 0);
    clicksArray.forEach(function (elt) {
        var title = elt.childNodes[1].value.toLowerCase();
        if (f != '' && title.indexOf(f) === -1) {
            elt.style.display = 'none';
        } else {
            elt.style.display = 'block';
        }
    });
}

function playSound(buffer, time) {
    if (sound == 'Bip') {
        var g = audioContext.createGain();
        g.connect(audioContext.destination);
        var osc = audioContext.createOscillator();
        osc.connect(g);
        osc.frequency.value = 440.0;
        g.gain.linearRampToValueAtTime(1, time);
        g.gain.linearRampToValueAtTime(0, time + noteLength);
        osc.start(time);
        osc.stop(time + noteLength);
    } else {
        var source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source[source.start ? 'start' : 'noteOn'](time);
    }
}

function loadSounds(obj, soundMap, callback) {
  // Array-ify
  var names = [];
  var paths = [];
  for (var name in soundMap) {
    var path = soundMap[name];
    names.push(name);
    paths.push(path);
  }
  bufferLoader = new BufferLoader(context, paths, function(bufferList) {
    for (var i = 0; i < bufferList.length; i++) {
      var buffer = bufferList[i];
      var name = names[i];
      obj[name] = buffer;
    }
    if (callback) {
      callback();
    }
  });
  bufferLoader.load();
}

function BufferLoader(context, urlList, callback) {
  this.context = context;
  this.urlList = urlList;
  this.onload = callback;
  this.bufferList = new Array();
  this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index) {
  // Load buffer asynchronously
  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  var loader = this;

  request.onload = function() {
    // Asynchronously decode the audio file data in request.response
    loader.context.decodeAudioData(
      request.response,
      function(buffer) {
        if (!buffer) {
          alert('error decoding file data: ' + url);
          return;
        }
        loader.bufferList[index] = buffer;
        if (++loader.loadCount == loader.urlList.length)
          loader.onload(loader.bufferList);
      },
      function(error) {
        console.error('decodeAudioData error', error);
      }
    );
  }

  request.onerror = function() {
    alert('BufferLoader: XHR error');
  }

  request.send();
};

BufferLoader.prototype.load = function() {
  for (var i = 0; i < this.urlList.length; ++i)
  this.loadBuffer(this.urlList[i], i);
};
/* end of shared.js*/

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
        if (halfNum == 2) {
            halfNum = 0;
            resolutions.push(resolutions.shift());
            setScores();
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
        var adv = 1 - (tempo2-tempo)/(tempo2-tempo1);
        var x = 0.2*w + 0.2*w*adv;
        var y = 0.5*h - 0.3*h*adv;
    } else {
        tempo = tempo2 - dev;
        if (tempo <= tempo1) {
            mode = "list up";
            started = audioContext.currentTime;
        }
        var adv = 1 - (tempo-tempo1)/(tempo2-tempo1);
        var x = 0.4*w + 0.2*w*adv;
        var y = 0.2*h + 0.3*h*adv;
    }
    tempoLabel.innerHTML = parseInt(tempo);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    tempoLabel.setAttribute('x', x);
    tempoLabel.setAttribute('y', y-30);
}

function scheduleNote( tickNumber, time ) {
    if (!(resolutions[0] * tickNumber % 48 == 0)) return;
    playSound(this.claves, time);
}

function scheduleBeat( time ) {
    playSound(this.claves, time);
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

    setResolutions();
    setScores();

    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        mode = "grid";
        nextTickTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "stop";
    } else {
        currentTick = 0;
        halfNum = 0;
        timerWorker.postMessage("stop");
        return "play";
    }
}

function playThis(event) {
    if(event) {  // can be null if we stop from the popup
        var children = event.target.parentElement.childNodes;
        tempo1 =   parseInt(children[2].value);
        tempo2 =   parseInt(children[4].value);
        duration = parseInt(children[6].value);
        tempoLabel.innerHTML = tempo;
        tempoLabel1.innerHTML = tempo1;
        tempoLabel2.innerHTML = tempo2;
        tempoLabel1Bis.innerHTML = tempo1;
    }

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
        popup.style.display = "block";
    } else {
        timerWorker.postMessage("stop");
        popup.style.display = "none";
    }
    return ">";
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
    clicksArray.forEach(function (elt) {list.append(elt);});
    alert("Sorted!");
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
    title.size = 35;
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
    event.target.parentElement.remove();
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
    if (locStorageOK) {
        storage.setItem('clicks', buildExport());
        alert("Saved to this browser!");
    } else {
        alert("Unable to save!");
    }
}

function parseImport(str) {
    var clicks = [];
    str.trim().split('\n').forEach(function (elt) {clicks.push(elt);});
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

function addParadiddles() {
    var items = [
        "paradiddles Rlrr Lrll: 90, 114, 60",
        "paradiddles rLrr lRll: 70, 88, 60",
        "paradiddles rlRr lrLl: 70, 80, 60",
        "paradiddles rlrR lrlL: 70, 80, 60",
        "paradiddles Rllr Lrrl: 70, 82, 60",
        "paradiddles rLlr lRrl: 70, 80, 60",
        "paradiddles rlLr lrRl: 70, 80, 60",
        "paradiddles rllR lrrL: 70, 80, 60",
        "paradiddles Rrlr Llrl: 70, 80, 60",
        "paradiddles rRlr lLrl: 70, 80, 60",
        "paradiddles rrLr llRl: 70, 88, 60",
        "paradiddles rrlR llrL: 70, 88, 60",
        "paradiddles Rlrl Lrlr: 70, 80, 60",
        "paradiddles rLrl lRlr: 70, 80, 60",
        "paradiddles rlRl lrLr: 70, 80, 60",
        "paradiddles rlrL lrlR: 70, 86, 60"];
    parseImport(items.join('\n'));
}

function addRudiments() {
    var items = [
        "rudim 01 Single stroke roll *: 120, 144, 60",
        "rudim 02 Single stroke four: 102, 128, 60",
        "rudim 03 Single stroke seven : 102, 128, 60",
        "rudim 04 Multiple bounce roll: 60, 68, 60",
        "rudim 05 Triple stroke roll: 60, 68, 60",
        "rudim 06 Double stroke open roll *: 82, 176, 60",
        "rudim 07 Five stroke roll: 54, 88, 60",
        "rudim 08 Six stroke roll: 54, 80, 60",
        "rudim 09 Seven stroke roll *: 48, 68, 60",
        "rudim 10 Nine stroke roll *: 50, 76, 60",
        "rudim 11 Ten stroke roll *: 50, 84, 60",
        "rudim 12 Eleven stroke roll *: 50, 84, 60",
        "rudim 13 Thirteen stroke roll *: 60, 60, 60",
        "rudim 14 Fifteen stroke roll: 60, 60, 60",
        "rudim 15 Seventeen stroke roll: 60, 60, 60",
        "rudim 16 Single paradiddle *: 82, 136, 60",
        "rudim 17 Double paradiddle *: 92, 126, 60",
        "rudim 18 Triple paradiddle: 92, 128, 60",
        "rudim 19 Single paradiddle-diddle: 56, 74, 60",
        "rudim 20 Flam *: 116, 182, 60",
        "rudim 21 Flam accent *: 74, 106, 60",
        "rudim 22 Flam tap *: 56, 78, 60",
        "rudim 23 Flamacue *: 76, 110, 60",
        "rudim 24 Flam paradiddle *: 60, 94, 60",
        "rudim 25 Single flammed mill: 56, 86, 60",
        "rudim 26 Flam paradiddlediddle *: 120, 180, 60",
        "rudim 27 Pataflafla: 52, 68, 60",
        "rudim 28 Swiss army triplet: 80, 126, 60",
        "rudim 29 Inverted flam tap: 40, 50, 60",
        "rudim 30 Flam drag: 76, 96, 60",
        "rudim 31 Drag *: 60, 80, 60",
        "rudim 32 Single drag tap *: 60, 80, 60",
        "rudim 33 Double drag tap *: 60, 80, 60",
        "rudim 34 Lesson 25 *: 60, 80, 60",
        "rudim 35 Single dragadiddle: 60, 80, 60",
        "rudim 36 Drag paradiddle #1 *: 60, 80, 60",
        "rudim 37 Drag paradiddle #2 *: 60, 80, 60",
        "rudim 38 Single ratamacue *: 60, 80, 60",
        "rudim 39 Double ratamacue *: 60, 80, 60",
        "rudim 40 Triple ratamacue *: 60, 80, 60 "];
    parseImport(items.join('\n'));
}

function addCreative() {
    var items = [
        "abb creative 01 4’s to 8 turnaround: 70, 90, 60",
        "abb creative 02 3’s to 4 turnaround: 70, 90, 60",
        "abb creative 03 Left hand blaster: 90, 108, 60",
        "abb creative 04 Interlaced singles builder: 166, 184, 60",
        "abb creative 05 Tricky triplet doubles: 112, 132, 60",
        "abb creative 06 Triplet accent shifter: 128, 148, 60",
        "abb creative 07 Paradiddlediddle turnaround: 82, 96, 60",
        "abb creative 08 Double stroke accent shifter: 45, 62, 60",
        "abb creative 09 Fast five turnaround: 80, 102, 60",
        "abb creative 10 Pullout accent builder: 60, 80, 60",
        "abb creative 11 Flam tap turnaround: 60, 76, 60",
        "abb creative 12 Funky flam flow: 68, 88, 60",
        "abb creative 13 Swiss triplet turnaround: 68, 84, 60",
        "abb creative 14 Triplet accent displacement: 100, 120, 60",
        "abb creative 15 Paraddidle accent displacement: 60, 80, 60"];
    parseImport(items.join('\n'));
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

function localStorageTest() {
    if (typeof storage !== 'undefined') {
        try {
            storage.setItem('feature_test', 'yes');
            if (storage.getItem('feature_test') === 'yes') {
                storage.removeItem('feature_test');
                return true;
            } else {
                alert("Local storage doesn't work correctly :(");
                return false;
            }
        } catch(e) {
            alert("Please enable local storage and reload!");
            return false;
        }
    } else {
        alert("Your browser doesn't support local storage.");
    }
}

function setResolutions() {
    resolutions = document.getElementById('resoSrc').value.split(' ');
}

function setScores() {
    score.src = 'img/' + resolutions[0] + '.png';
    score.alt = values[resolutions[0]];
    if (resolutions.length > 1) {
        score2.src = 'img/' + resolutions[1] + '.png';
        score2.alt = values[resolutions[1]];
    } else {
        score2.src = 'img/' + resolutions[0] + '.png';
        score2.alt = values[resolutions[0]];
    }
}

function init(){

    score = document.getElementById("score");
    score2 = document.getElementById("score2");
    setResolutions();
    setScores();

    list = document.getElementById("list");
    popup = document.getElementById("popup");
    svg = document.getElementById("svg");
    w = window.innerWidth  || document.body.clientWidth;
    h = window.innerHeight || document.body.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + 0.8*w + ' ' + 0.7*h);
    var filterElt = document.getElementById('filter');
    filterElt.onkeyup = filter;
    // draw the viz base
    var newElement = document.createElementNS("http://www.w3.org/2000/svg",
                                              'polyline');
    var points = '' + 0.2*w + ',' + 0.5*h + ' '
                    + 0.4*w + ',' + 0.2*h + ' '
                    + 0.6*w + ',' + 0.5*h;
    newElement.setAttribute('points', points);
    newElement.style.fill = "none";
    newElement.style.stroke = "#000";
    newElement.style.strokeWidth = "5px";
    newElement.style.strokeLinecap="round";
    svg.appendChild(newElement);
    // create the dot
    dot = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
    dot.setAttribute('cx', 0.2*w);
    dot.setAttribute('cy', 0.5*h);
    dot.setAttribute('r', 20);
    dot.style.fill = "#000";
    svg.appendChild(dot);
    // create the tempoLabel
    tempoLabel = document.createElementNS("http://www.w3.org/2000/svg", 'text');
    tempoLabel.setAttribute('text-anchor', 'middle');
    tempoLabel.setAttribute('x', 0.2*w);
    tempoLabel.setAttribute('y', 0.45*h);
    tempoLabel.innerHTML = tempo;
    svg.appendChild(tempoLabel);
    // create the tempoLabel1
    tempoLabel1 = document.createElementNS("http://www.w3.org/2000/svg", 'text');
    tempoLabel1.setAttribute('text-anchor', 'middle');
    tempoLabel1.setAttribute('x', 0.2*w);
    tempoLabel1.setAttribute('y', 0.55*h);
    tempoLabel1.innerHTML = tempo1;
    svg.appendChild(tempoLabel1);
    // create the tempoLabel2
    tempoLabel2 = document.createElementNS("http://www.w3.org/2000/svg", 'text');
    tempoLabel2.setAttribute('text-anchor', 'middle');
    tempoLabel2.setAttribute('x', 0.4*w);
    tempoLabel2.setAttribute('y', 0.25*h);
    tempoLabel2.innerHTML = tempo2;
    svg.appendChild(tempoLabel2);
    // create the tempoLabel1Bis
    tempoLabel1Bis = document.createElementNS("http://www.w3.org/2000/svg", 'text');
    tempoLabel1Bis.setAttribute('text-anchor', 'middle');
    tempoLabel1Bis.setAttribute('x', 0.6*w);
    tempoLabel1Bis.setAttribute('y', 0.55*h);
    tempoLabel1Bis.innerHTML = tempo1;
    svg.appendChild(tempoLabel1Bis);

    // config
    var soundElt = document.getElementById('sound');
    soundElt.onchange = soundChange;

    // fetch data from storage
    locStorageOK = localStorageTest();
    if (locStorageOK) {
        var localData = storage.getItem('clicks');
        if (localData) {
            parseImport(localData.trim());
        } else {
            var data = {'title': "Click + or import to add clicks",
                        'tempo1': 80, 'tempo2': 100, 'duration': 60};
            add(data);
            location.href = "#";
            location.href = "#fr";
        }
    }

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // https://freewavesamples.com/claves
    loadSounds(this, {claves: 'audio/Claves.wav'});


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

