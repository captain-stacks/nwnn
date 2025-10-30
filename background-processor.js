import 'dotenv/config';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { generateFeed } from './lib/generate-feed.js';

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerMinute: 3,
  minTimeBetweenRequests: (60000 / 3) + 1000, // minimum ms between requests + 1 second safety margin
  lastRequestTime: 0
};

const execAsync = promisify(exec);
const HISTORY_FILE = 'processed-links.json';
const RSS_FILE = 'public/feed.xml';
const ONE_HOUR = 60 * 60 * 1000;

// Check for required environment variable
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to enforce rate limiting
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
  const timeToWait = Math.max(0, RATE_LIMIT.minTimeBetweenRequests - timeSinceLastRequest);
  
  if (timeToWait > 0) {
    console.log(`Rate limit: waiting ${(timeToWait / 1000).toFixed(1)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, timeToWait));
  }
  
  RATE_LIMIT.lastRequestTime = Date.now();
}

// Function to classify sentiment
async function classifySentiment(text) {
  const prompt = `
You are a text classifier that evaluates whether the user would like to read the article in question.

Instructions:
1. Read the text below.
2. Consider the user's perspective: the user exercizes sovereignty over his use of technology. He is interested in hearing about generally positive news as well as negative news happening to people who do not exercise sovereignty over their personal technology. Reject if the news is depressing, and is not expected to have critical insights the user would benefit from.
3. Classify the text as "show" or "hide".
4. For "show", justify your classification in 1-2 sentences. For "hide", provide a single word or phrase that explains without triggering the user.

Text:
${text}
`;

  // Enforce rate limit before making the request
  await waitForRateLimit();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0
  });

  const sentiment = response.choices[0].message.content.trim();
  
  console.log('OpenAI response:', sentiment);

  return sentiment;
}

// Load existing history or create new
async function loadHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { processedLinks: [] };
  }
}

// Save history back to file
async function saveHistory(history) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Git operations to commit and push changes
async function gitCommitAndPush() {
  try {
    const timestamp = new Date().toISOString();
    await execAsync('git add public/feed.xml');
    await execAsync(`git commit -m "Update RSS feed: ${timestamp}"`);
    await execAsync('git push origin main');
    console.log('Successfully committed and pushed RSS feed');
  } catch (err) {
    console.error('Git operation failed:', err.message);
  }
}

// Main processing function
async function processLinks() {
  try {
    console.log('Starting link processing:', new Date().toISOString());
    
    // Load existing history
    const history = await loadHistory();
    const processedIds = new Set(history.processedLinks.map(l => l.id));
    
    // Fetch new links
    const res = await fetch('https://nwnn.l484.com/api/links');
    const data = await res.json();
    
    // Process new links
    for (const link of data.links) {
      if (processedIds.has(link.id)) {
        continue; // Skip already processed links
      }
      
      const text = `${link.title} ${link.description || link.messageText || ''}`;
      const sentiment = await classifySentiment(text);
      
      // Store all processed items with their sentiment results
      let processedLink = {
        id: link.id,
        title: link.title,
        url: link.url,
        description: link.description,
        messageText: link.messageText,
        domain: link.domain,
        image: link.image,
        createdAt: link.createdAt,
        processedAt: new Date().toISOString(), // keep processing time for debugging
        sentiment,
        approved: sentiment.toLowerCase().includes('show')
      };
      if (!processedLink.approved) {
        processedLink = {
          id: link.id,
          sentiment: sentiment
        };
      }
      
      history.processedLinks.push(processedLink);
      
      // Save history progress after each item
      try {
        await saveHistory(history);
      } catch (err) {
        console.error('Error saving history:', err);
        // Continue processing other items even if save fails
      }
    }
    
    // After all items are processed, check if we had any new approved items
    try {
      // Count how many new approved items we had in this batch
      const newApprovedItems = data.links
        .filter(link => !processedIds.has(link.id))
        .filter(link => {
          const processedLink = history.processedLinks.find(p => p.id === link.id);
          return processedLink?.approved;
        });
      
      if (newApprovedItems.length > 0) {
        // Get all approved links and generate feed
        const approvedLinks = history.processedLinks.filter(link => link.approved);
        const rssXml = generateFeed(approvedLinks);
        await fs.writeFile(RSS_FILE, rssXml, 'utf8');
        
        // Commit and push RSS feed
        await gitCommitAndPush();
        
        console.log('Updated and committed RSS feed with ' + newApprovedItems.length + ' new approved items');
      } else {
        console.log('No new approved items in this batch, skipping RSS update');
      }
    } catch (err) {
      console.error('Error updating RSS feed:', err);
    }
    
    console.log('Finished processing:', new Date().toISOString());
  } catch (err) {
    console.error('Error in processLinks:', err);
  }
}

// Start the background process
async function startBackgroundProcess() {
  console.log('Starting background process');
  
  // Initial run
  await processLinks();
  
  // Schedule hourly runs
  setInterval(processLinks, ONE_HOUR);
}

// Start the process
startBackgroundProcess().catch(console.error);