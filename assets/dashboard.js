'use strict';
// Keep existing engine-map bookmarks working after introducing the dashboard.
if(['scope','focus','graph'].some(key=>new URLSearchParams(location.search).has(key)))location.replace('spider-sandbox.html'+location.search+location.hash);
const search=document.getElementById('search');const status=document.getElementById('status');
search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();let count=0;for(const card of document.querySelectorAll('.entry')){card.hidden=!card.textContent.toLocaleLowerCase().includes(q);if(!card.hidden)count++;}status.textContent=q?`${count} matching ${count===1?'entry':'entries'}.`:'5 places to explore.';});
