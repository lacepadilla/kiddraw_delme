
// function for sending data to mturk
function sendData() {
  console.log('sending data to mturk');
  jsPsych.turk.submitToTurk({'score':0});
}

// Define experiment metadata object
function Experiment () {
  this.type = 'jspsych-cued-drawing';
  this.dbname = 'photodraw';
  this.colname = 'kiddraw'
  this.iterationName = 'development';
  this.devMode = true; // Change this to TRUE if testing in dev mode (short trial videos) or FALSE for real experiment
}

// Define session metadata object 
function Session () {
  this.conditions = ['photo', 'text'];
  this.categories = ['airplane', 'bike','bird','cat', 'car', 'chair', 'cup', 'hat', 'house', 'rabbit', 'tree', 'watch'];  
  this.numTrials = this.categories.length; 
  this.numItemsPerCategory = 3;  // num of stimuli in each class  
  this.numTrialsPerCondition = this.categories.length/this.conditions.length;  

  // Create array of condition labels, assuming for now that they are shuffled 
  // and assigned in equal proportion to each category
  // first, determine how many repetitions of each condition (numTrialsPerCondition)
  // second, repeat the condition label that many times (_.times)
  // third, map over each condition label 
  // fourth, flatten and shuffle to get a condition array
  var conditionArray = _.shuffle(
    _.flatten(
      _.map(this.conditions, function(n,i) {
        return _.times(this.numTrialsPerCondition,_.constant(n))
      }.bind(this))))

  // Create raw trials list
  this.trials = _.map(_.shuffle(this.categories), function (n,i) {
    return trial = _.extend({}, new Experiment, { 
        category: n, 
        trialNum: i,
        numTrials: this.numTrials,
        condition: conditionArray[i], 
        imageURL: makeURL(n, this.numItemsPerCategory)        
        }
      )
  }.bind(this))

  function makeURL(category, numItems) {
    return 'https://photodraw.s3.amazonaws.com/'+ category + '_' + (Math.floor(Math.random() * numItems) + 1) + '.png';
  }  
}

// main function for running the experiment
function setupGame() {
  var socket = io.connect();
  socket.on('onConnected', function(d) {
    // Get workerId, etc. from URL (so that it can be sent to the server)
    var turkInfo = jsPsych.turk.turkInfo();

    // At end of each trial save score locally and send data to server
    var main_on_finish = function(data) {
      socket.emit('currentData', data);
      console.log('emitting trial data', data);
    }
            
    // Add additional boilerplate info to each trial object
    var additionalInfo = {
      gameID: d.gameid,
      on_finish: main_on_finish
    }    

    // Create trial list
    var session = new Session; 
    var trials = _.flatten(_.map(session.trials, function(trialData, i) {
      var trial = _.extend({}, additionalInfo, trialData, {trialNum: i});
      return trial;
    }));

    // Define consent form language
    consentHTML = {
      'str1' : '<p> Hello! In this HIT, you will make some drawings of objects! </p><p> We expect the average game to last about 10 minutes, including the time it takes to read these instructions. For your participation in this study, you will be paid $2.00.</p><i><p> Note: We recommend using Chrome. We have not tested this HIT in other browsers.</p></i>',
      'str2' : ["<u><p id='legal'>Consenting to Participate:</p></u>",
    "<p id='legal'>By completing this HIT, you are participating in a study being performed by cognitive scientists at UC San Diego. If you have questions about this research, please contact the <b>Cognitive Tools Lab</b> at <b><a href='mailto://cogtoolslab.requester@gmail.com'>cogtoolslab.requester@gmail.com</a></b>. You must be at least 18 years old to participate. There are neither specific benefits nor anticipated risks associated with participation in this study. Your participation in this research is voluntary. You may decline to answer any or all of the following questions. You may decline further participation, at any time, without adverse consequences. Your anonymity is assured; the researchers who have requested your participation will not reveal any personal information about you.</p>"].join(' ')
    }
    // Define instructions language
    instructionsHTML = {
      'str1' : "<p> In this HIT, you will be making drawings of familiar objects. Your goal is to make these drawings <b>recognizable</b> to someone else trying to identify what you were trying to draw. But you do not need to be concerned about making them pretty.</p>", 
      'str2' : '<p> On some trials, you will be prompted with a <b>word</b>. </p> <br><img height = "300" src = "stimuli/text_cue_demo.png">',
      'str3' : '<p> On these trials, your specific goal is to make a drawing that would help someone else looking only at your drawing guess which <b>word</b> you were prompted with. </p> <br><img height = "400" src = "stimuli/figurine_guessing_textcue.png">',
      'str4' : '<p> On other trials, you will be prompted with an <b> image and word </b>. </p> <br><img height = "300" src = "stimuli/photo_cue_demo.png">',
      'str5' : '<p> On these trials, your specific goal is to make a drawing that would help someone else looking only at your drawing  guess which <b>image</b> you were prompted with, out of a lineup containing other similar images. </p> <br><img height = "400" src = "stimuli/figurine_guessing_photocue.png">',
      'str6' : '<p> In both cases, please only draw a single object and do not add any words, arrows, numbers, or surrounding context around your object drawing. For instance, if you are drawing a horse, please do not draw any grass around it.</p> <img height = "300" src = "stimuli/banned_drawings_demo.png">',
      'str7' : "<p> Once you are finished, the HIT will be automatically submitted for approval. If you encounter a problem or error, please send us an email <a href='mailto://cogtoolslab.requester@gmail.com'>(cogtoolslab.requester@gmail.com)</a> and we will make sure you're compensated for your time. Thank you again for contributing to our research! Finally, if you enjoyed this HIT, please know that you are welcome to perform it multiple times. Let's begin! </p>"
    }      

    var previewTrial = {
      type: 'instructions',
      pages: [consentHTML.str1],
      show_clickable_nav: true,
      allow_keys: false,
      allow_backward: false,
      delay: true,
      delayTime:120000
    }  

    // Create consent + instructions instructions trial
    var welcome = {
      type: 'instructions',
      pages: [
        consentHTML.str1,
        consentHTML.str2,
        instructionsHTML.str1,
        instructionsHTML.str2,
        instructionsHTML.str3,
        instructionsHTML.str4,
        instructionsHTML.str5,
        instructionsHTML.str6,
        instructionsHTML.str7
      ],
      force_wait: 1500, 
      show_clickable_nav: true,
      allow_keys: false,
      allow_backward: false
    }

    // Create comprehension check survey
    var comprehensionSurvey = {
      type: 'survey-multi-choice',
      preamble: "<strong>Comprehension Check</strong>",
      questions: [
                {
        prompt: "What is your goal when making each drawing?",
        name: 'goalOfDrawing',
        options: ["To make it as pretty as possible.", "To make it so someone else could identify what you were trying to draw."]
                },
          {
        prompt: "If you are prompted with an IMAGE, what is your specific goal?",
        name: 'imageGoal',
        options: ["To make a drawing that looks enough like the IMAGE that someone could pick it out of a lineup containing other, similar images.", "To make a drawing that looks identical in every way to the IMAGE."]
          },
          {
        prompt: "If you are prompted with a WORD, what is your specific goal?",
        name: 'wordGoal',
        options: ["To make a drawing that looks as realistic as possible.","To make a drawing that someone could use to guess the name of the object you were trying to draw."]
          },
                {
        prompt: "Should you add words, arrows, or surrounding context to your drawing?", 
        name: 'bannedDrawings',
        options: ["Yes", "No"],
        required: true
                },
                {
        prompt: "Are you allowed to perform this HIT multiple times?", 
        name: 'numberHITs',
        options: ["Yes", "No"],
        required: true
                }
      ]
    }

    // Check whether comprehension check is answered correctly
    var loopNode = {
      timeline: [comprehensionSurvey],
      loop_function: function(data) {
          resp = JSON.parse(data.values()[0]['responses']);
          if ((resp["bannedDrawings"] == 'No' && resp["numberHITs"] == 'Yes' && resp["goalOfDrawing"] == "To make it so someone else could identify what you were trying to draw." && resp['imageGoal']=="To make a drawing that looks enough like the IMAGE that someone could pick it out of a lineup containing other, similar images." && resp['wordGoal']=="To make a drawing that someone could use to guess the name of the object you were trying to draw.")) { 
              return false;
          } else {
              alert('Try again! One or more of your responses was incorrect.');
              return true;
        }
      }
    }

    // Create goodbye trial (this doesn't close the browser yet)
    var goodbye = {
      type: 'instructions',
      pages: [
        'Thanks for participating in our experiment! You are all done. Please click the button to submit this HIT.'
      ],
      show_clickable_nav: true,
      allow_backward: false,
      on_finish: function() { sendData();}
    }

    
    // exit survey trials
    var surveyChoiceInfo = _.omit(_.extend({}, additionalInfo, new Experiment),['type','dev_mode']);  
    var exitSurveyChoice = _.extend( {}, surveyChoiceInfo, {
      type: 'survey-multi-choice',
      preamble: "<strong><u>Exit Survey</u></strong>",
      questions: [
        {prompt: "What is your sex?",
         name: "participantSex",
         horizontal: false,
         options: ["Male", "Female", "Neither/Other/Do Not Wish To Say"],
         required: true
        },
        {prompt: "Which of the following did you use to make your drawings?",
         name: "inputDevice",
         horizontal: false,
         options: ["Mouse", "Trackpad", "Touch Screen", "Stylus", "Other"],
         required: true
        },
        {prompt: "How skilled do you consider yourself to be at drawing? (1: highly unskilled; 7: highly skilled)",
         name: "subjectiveSkill",
         horizontal: false,
         options: ["1","2","3","4","5","6","7"],
         required: true
        },
      ],
      on_finish: main_on_finish
    });

    
    // Add survey page after trials are done
    var surveyTextInfo = _.omit(_.extend({}, additionalInfo, new Experiment),['type','dev_mode']);
    var exitSurveyText =  _.extend({}, surveyTextInfo, {
      type: 'survey-text',
      preamble: "<strong><u>Exit Survey</u></strong>",
      questions: [
      {name: "TechnicalDifficultiesFreeResp",
        prompt: "If you encountered any technical difficulties, please briefly describe the issue.",
        placeholder: "I did not encounter any technical difficulities.",
        rows: 5, 
        columns: 50, 
        required: false
      },
      { name: 'participantAge', 
        prompt: "What is your year of birth?", 
        placeholder: "e.g. 1766", 
        require: true
      },        
      { name: 'participantComments', 
        prompt: "Thank you for participating in our HIT! Do you have any other comments or feedback to share with us about your experience?", 
        placeholder: "I had a lot of fun!",
        rows: 5, 
        columns: 50,
        require: false
      }
    ],
    on_finish: main_on_finish
    });    

    // insert comprehension check 
    trials.unshift(loopNode);   

    // Stick welcome trial if not previewMode, otherwise insert preview trial
    if (!turkInfo.previewMode) {
      trials.unshift(welcome);
    } else {
      trials.unshift(previewTrial);
    }    

    // insert exit surveys
    trials.push(exitSurveyChoice);
    trials.push(exitSurveyText);

    // append goodbye trial
    trials.push(goodbye);

    // create jspsych timeline object
    jsPsych.init({
      timeline: trials,
      default_iti: 1000,
      show_progress_bar: true
    });
      
  });


}
