from flask import Flask, url_for, render_template
import os

app = Flask(__name__)


@app.route("/")
@app.route("/index")
def index():
    return render_template('index.html')


@app.errorhandler(404)
def not_found(err):
    style = url_for("static", filename="css/errors/error404.css")
    path = url_for("static", filename="images/errors/sad.webp")
    path1 = url_for("static", filename="images/errors/bingo.webp")
    path2 = url_for("static", filename="images/errors/disgust.jpg")
    return '''
<!doctype html>
<html>
    <head>
        <title>Not Found</title>
        <link rel="stylesheet" href="''' + style + '''">
    </head>
    <body>
        <img class="c" src="''' + path2 + '''">
        <h1><span class="e">4</span><span class="d">0</span>4</h1>
        <h2>Ошибка</h2>
        <div class="a"><img class="a" src="''' + path + '''"></div>
        <h3>Такой страницы у нас нет, но есть другие!</h3>
        <div class="b"><img class="b" src="''' + path1 + '''"></div>
    </body>
</html>
''', 404


@app.errorhandler(500)
def internal_server_error(err):
    style = url_for("static", filename="css/errors/error500.css")
    path = url_for("static", filename="images/errors/simka.png")
    path1 = url_for("static", filename="images/errors/nolik.png")
    path2 = url_for("static", filename="images/errors/masya.png")
    return '''
<!doctype html>
<html>
<head>
    <title>Internal Server Error</title>
    <link rel="stylesheet" href="''' + style + '''">
</head>
    <body>
        <img class="a" src="''' + path + '''">
        <img class="b" src="''' + path1 + '''">
        <img class="c" src="''' + path2 + '''">
        <h1><span class="e">5</span><span class="d">0</span>0</h1>
        <h2>Ошибка</h2>
        <h3>
            На нашем сервере произошла небольшая ошибка, вскоре она будет
            исправлена, мы уже работаем над ней!
        </h3>
    </body>
</html>
''', 500

