// OSINT Agent Companion - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  const scrapeCount = document.getElementById('scrape-count');
  const openApp = document.getElementById('open-app');
  
  // Check connection to web app
  async function checkConnection() {
    try {
      // Try to get stored results count
      const result = await chrome.storage.local.get(null);
      const resultCount = Object.keys(result).filter(k => k.startsWith('result_')).length;
      scrapeCount.textContent = resultCount;
      
      // Update status
      statusBadge.classList.remove('disconnected');
      statusBadge.classList.add('connected');
      statusBadge.querySelector('.status-dot').classList.remove('disconnected');
      statusBadge.querySelector('.status-dot').classList.add('connected');
      statusText.textContent = 'Ready';
      
    } catch (error) {
      console.error('Error checking status:', error);
      statusBadge.classList.remove('connected');
      statusBadge.classList.add('disconnected');
      statusBadge.querySelector('.status-dot').classList.remove('connected');
      statusBadge.querySelector('.status-dot').classList.add('disconnected');
      statusText.textContent = 'Error';
    }
  }
  
  // Open the OSINT Agent Orchestra app
  openApp.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ 
      url: 'https://05250d5d-349c-499a-8023-e11015268746.lovableproject.com/'
    });
  });
  
  await checkConnection();
});
