document.getElementById('request-btn').addEventListener('click', async () => {
  const successMsg = document.getElementById('success-msg');
  const errorMsg = document.getElementById('error-msg');
  
  successMsg.style.display = 'none';
  errorMsg.style.display = 'none';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    successMsg.style.display = 'block';
  } catch (err) {
    console.error(err);
    errorMsg.innerText = 'Error: ' + err.message;
    errorMsg.style.display = 'block';
  }
});
