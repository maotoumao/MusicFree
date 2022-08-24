export var template = () => String.raw`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>分享</title>
    <style>
      html body {
        margin: 0;
        overflow: hidden;
        height: 100vh;
        background-color: #f9f1db;
      }
      #container {
        width: 100%;
        height: 60vh;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    </style>
  </head>
  <body>
    <div id='container'></div>
    <script>
    //   var innerCanvas = document.querySelector('#canvas');
      function generateQRCode(info) {
        try{
            var qrcode = new QRCode('container', {
                text: info.content,
                width: innerWidth * 0.4,
                height: innerWidth * 0.4,
                colorDark: '#4d4030',
                colorLight: '#f9f1db',
                correctLevel: QRCode.CorrectLevel.L,
              });
              window.ReactNativeWebView.postMessage(document.querySelector('img').src);
        } catch(e){
            window.ReactNativeWebView.postMessage(e.message);
        }
      }

    </script>
  </body>
</html>
`





