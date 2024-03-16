import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import * as fs from 'fs';
import { YoutubeTranscript } from 'youtube-transcript';
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });


async function main(url, specId, specTag, code){

  try{

    
    const supabase = createClient(process.env.SUPABASE_PUBLIC_URL, process.env.SUPABASE_SERVICE_KEY)

    const specItemId = await getSpecItemIdFromTag(supabase, specId, specTag);
    console.log("specItemId", specItemId);


   const transcript = await getTranscript(url);

   console.log("## Transcript received.", transcript.length, "chars")
   

   const summary = await getSummary(transcript);

   console.log("## Summary received.", summary.length, "chars")

   const result = await uploadPage(supabase, code, specId, specItemId, transcript, summary)

   console.log("DB updated, result:", result);

   const questions = await getQuestions(transcript);

   const questionResult = uploadQuestions(supabase, specItemId, code, questions)

   

  } catch (error) {
    console.error(error);
  }
  
}

async function getTranscript(url){
  const response = await YoutubeTranscript.fetchTranscript(url);

  return  response.reduce((prev, curr) => prev + curr.text, "")
  
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

async function uploadPage(supabase, code, specId, specItemId, transcript, summary) {

  try{
    
    const {data, error} = await supabase.from("dqPage").upsert({id: code, summary, specItemId, transcript}).select("id")
    
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

      console.log(question_text, choices, correct_answer)
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


const code= process.argv[2];
const specId = process.argv[3];
const specItemId = process.argv[4]

console.log(`Getting data for `, code)
console.log(`SpecId`, specId)
console.log(`SpecItemId`, specItemId)

// node textbook.js 'mUxgOlnwoHo' 1 3.1.1;  
//
// 'mUxgOlnwoHo'  - url code
// 1              - specId
// 3.1.1          - SpecTag
main(`https://youtu.be/mUxgOlnwoHo${code}`, specId, specItemId, code)


