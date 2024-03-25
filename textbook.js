
// todo: check questions answers must match available questions
// todo: document the command parameters

import dotenv from 'dotenv';
dotenv.config();
import OpenAI from 'openai';
import * as fs from 'fs';
import {readFile} from "fs/promises";


import { YoutubeTranscript } from 'youtube-transcript';
import { createClient } from '@supabase/supabase-js'


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


async function processRecord(url, specId, specTag, code, title){

  try{

    
    const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPABASE_SERVICE_KEY)

    const specItemId = await getSpecItemIdFromTag(supabase, specId, specTag);
    
    if (specItemId === undefined){
      console.error(`Cant Find spec Item ID for '${specId}' '${specTag}'`)
      return;
    }

    console.log("Found specItemId", specId, specTag, specItemId);

    const questionCount = await getQuestionCount (supabase, code) 

    console.log(`Found ${questionCount} questions.`)
    
    if (questionCount >= 20){
      console.log(`Too many questions (${questionCount}) for ${code}.  Skipping`);
      return;
    }

   const {transcript, error} = await getTranscript(url);

   if (error){
    console.error("Error detected with code", code, ". exiting");
    return;
   }

   

   console.log("## Transcript received.", transcript.length, "chars")
   // console.log("## Transcript received.", transcript.slice(0,300), "chars")
   

   const summary = await getSummary(transcript);

   console.log("## Summary received.", summary.length, "chars")
   // console.log("## Summary received.", summary.slice(0, 300), "chars")

   const result = await uploadPage(supabase, code, specId, specItemId, transcript, summary, title)

   console.log("DB updated, result:", result);

   let questions = await getQuestions(transcript);
   let questionResult = await uploadQuestions(supabase, specItemId, code, questions)
   console.log("Uploaded ", questionResult.length, "questions")

   questions = await getQuestions(transcript);
   questionResult = await uploadQuestions(supabase, specItemId, code, questions)
   console.log("Uploaded ", questionResult.length, "questions")

   questions = await getQuestions(transcript);
   questionResult = await uploadQuestions(supabase, specItemId, code, questions)
   console.log("Uploaded ", questionResult.length, "questions")

   questions = await getQuestions(transcript);
   questionResult = await uploadQuestions(supabase, specItemId, code, questions)
   console.log("Uploaded ", questionResult.length, "questions")

   return true;

  } catch (error) {
    console.error(error);
  }
  
}

async function getQuestionCount(supabase, code) {
  try {
    const {count, error} = await supabase.from("dqQuestions")
                  .select('*', { count: 'exact', head: true })
                  .eq("code", code);
    
    if (error) {
      throw new Error(error.message)
    }

    console.log("Count Data", count);
    return count;

  } catch(error){
    console.error(error.message);
    return null;
  }
}

async function getTranscript(url){
  try{

    const response = await YoutubeTranscript.fetchTranscript(url);

  return  {transcript: response.reduce((prev, curr) => prev + curr.text, ""), error: null}
  } catch(error) {
    console.error(error.message);
    return {transcript: null, error}
  }
  
  
}

async function getQuestions(transcript) {

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {"role": "system", "content": 'Be a computer science teacher, teaching GCSE computer science.'},
      {"role": "user", "content": 'here is a transcript of a video ' },
      {"role": "user", "content": transcript},
      {"role": "user", "content": 'Create a multiple choice question and answer to test the pupils understanding of the text.'},
      
    ],
    // stream: true,
    functions: [
      {
        name: "create_multiple_choice_question",
        description: "create 5 multiple choice question and correct_answer based on video transcript.  Ensure that only 1 correct answer per question.",
        parameters: {
          type: "object",
          required: ["questions", "correct_answers", "choices"],
          properties: {
            "questions": {
              "type" : "array",
              "items": {
                type: "string"
              },
              "description": "The question texts. Identify each question text with [ ]."
            },

            "choices" : {
              "type" : "array",
              "items": {
                type: "string"
              },
              "description" : 'the choices of each question. identify each choice with [ ].'
            },
            
            "correct_answers":{
              "type" : "array",
              "items": {
                type: "array",
                "items" : {
                  type: "string"
                },
              },
              description: "the correct answers for each question."
            },
          }
        }
      }
    ],
    function_call:"auto"
    
  });

const args = JSON.parse(response.choices[0].message.function_call.arguments);

console.log(args);

return args;
}

async function getSummary(transcript) {

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {"role": "system", "content": 'Be a computer science teacher, teaching GCSE computer science.'},
      {"role": "user", "content": 'here is a transcript of a video ' },
      {"role": "user", "content": transcript},
      {"role": "user", "content" : "Provide a summary of the transcript, aimed at a reading age of 14 years old."}
    ]
  });

  return response.choices[0].message.content;
    
}

async function getSpecItemIdFromTag(supabase, specId, tag) {
  try{
    
    const {data, error} = await supabase.from("SpecItem").select("id, tag").eq("SpecId", specId).eq("tag", tag)
    
    if (error) {
      throw(error);
    }
    
    return data[0].id;

  }catch(error){
    console.error(error);
    
  }
}

async function uploadPage(supabase, code, specId, specItemId, transcript, summary, title) {

  try{
    
    const {data, error} = await supabase.from("dqPage").upsert({id: code, summary, specItemId, transcript, title}).select("id")
    
    if (error) {
      throw(error);
    }
    
    return data[0].id;

  }catch(error){
    console.error(error);
  }

}

async function uploadQuestions(supabase, specItemId, code, questions) {
  try {

    const insertedIds = []

    for (let i = 0; i < questions.questions.length; i++) {
      const question_text = questions.questions[i];
      const choices = questions.choices[i];
      const correct_answer = questions.correct_answers[i][0];

      // console.log(question_text)
      const {data, error} = await supabase.from("dqQuestions").insert({ specItemId, code, question_text, choices, correct_answer}).select("id")
    
      if (error) {
          throw(error);
      }

      insertedIds.push(data[0].id)

    }
    
    return insertedIds;
    
  } catch(error)
  {
    console.error(error);
  }
}



async function readThisFile(filePath) {
  try {

    const data = await readFile(filePath);
    const lines = data.toString().split('\n')
    const uploadData = [];

    for (const line of lines){
      
      const fields = line.split(",")
      
      if (fields.length < 5) {
        continue;
      }

      if (fields[3].length == 0) {
        continue;
      }


      const [specId, specTag, specTagTitle, code, title] = [...fields];

      uploadData.push({specId, specTag, code, title: title.trim()})
    }

    return uploadData

    
  } catch (error) {
    console.error(`Got an error trying to read the file: {error.message}`);
 }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}




const processFile = async (fileName) => {
  
  const uploadData = await readThisFile(`./${fileName}.csv`)

  console.log("main", uploadData);
  
  for (const data of uploadData){
    const result = await processRecord(`https://youtu.be/${data.code}`, data.specId, data.specTag, data.code, data.title)
    
    if (result == true){
      console.log("Update worked, sleeping")
      await sleep(10000);
    }
    
  }

}

console.log("Processing argvs", process.argv);

// process a file
if (process.argv[2].slice(0, 2) == "-f"){
  const fileName = process.argv[2].split(":")[1];
  console.log("Processing", fileName)
  await processFile(fileName);
}

if (process.argv[2].slice(0, 2) == "-c"){
  const code = process.argv[3];
  const specId = process.argv[4];
  const tag = process.argv[5];
  const title = process.argv[6];

  console.log("Processing", code, specId, tag, title);
  await processRecord(`https://youtu.be/${code}`, specId, tag, code, title);
}

process.exit(0);




