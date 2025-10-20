# FutureArena

this folder is for my project, FutureArena, I want to make challenges for LLMs and agents. So, this will host a github page. And it contains one title and metric about MeasureAGI, which is a calendar for 100 days. You should have the words and a panel about caldendar about AGI or not. Users can submitt 3 things, first challenge, which is a quation that need to be answered by LLMs or agents. It should have a clear answer like selection, and also a timestamp. And users can submit a LLM api or an agent system python code. There will be two ranks, which are two Line chart, x-asis is day, and y-asis is problem solved. Everyday we will choose 10 questions, and submitted LLMs will be put into our agent framework to predict the answer, or upload their agent system to directly predict the answer. We need to make sure the time to predict is early than the result release. users should be able to check the generated content of each LLM and agent system. If any AI have >=9/10 correct predictions, we call it AGI day. and if one agent or LLM can make AGI day in continuous 100 days, we call it AGI achieved. now give me the website, you can first give me a detailed plan

## Site Structure

- `index.html` – Primary landing page with hero metrics, AGI calendar, and leaderboard snapshot.
- `submissions.html` – Forms for challenge, LLM API, and agent system onboarding with deadline status.
- `daily.html` – Daily challenge deck showcasing sample predictions and outputs.
- `faq.html` – Key MeasureAGI logistics and policy answers.

Shared styling lives in `assets/css/styles.css`, interactive behaviour and sample data wiring in `assets/js/app.js`, backed by `assets/data/sample-data.json`.
