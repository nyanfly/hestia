#!/usr/bin/env python3

import datetime
import email.utils
import mailbox
import re
import time
import tornado.ioloop
import tornado.web
import tornado.websocket

MAILBOX_PATH = '/home/pi/Maildir'
PORT = 8888

MESSAGE_EXPIRY_TIME = datetime.timedelta(7)  # 7 days

def parse_body(message):
    if message.is_multipart():
        for part in message.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get('Content-Disposition'))

            # skip any text/plain (txt) attachments
            if ctype == 'text/plain' and 'attachment' not in cdispo:
                body = part.get_payload(decode=True)  # decode
                break
    # not multipart - i.e. plain text, no attachments, keeping fingers crossed
    else:
        body = message.get_payload(decode=True)

    return body.decode('UTF-8')

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.write("Hello, world")

class MessageWebSocket(tornado.websocket.WebSocketHandler):
    def __init__(self, *args, **kwargs):
        super(MessageWebSocket, self).__init__(*args, **kwargs)
        self.sent_messages = set()

    def open(self):
        print("WebSocket opened")

    def on_message(self, message):
        if message == 'request-all':
            # reply with all messages until now
            send_messages(self, mail)
            self.sent_messages.update(mail.keys())

        elif message == 'request-update':
            messages = {k: v for k, v in mail.items() if k not in self.sent_messages}
            send_messages(self, messages, {'type': 'response-update'})
            self.sent_messages.update(messages.keys())

        elif message == 'request-most-recent':
            # reply with most recent message
            #send_messages(self, mail.values())
            pass

    def on_close(self):
        print("WebSocket closed")

def make_app():
    return tornado.web.Application([
        (r"/websocket", MessageWebSocket),
        (r"/(.*)", tornado.web.StaticFileHandler, {"path": "static/", "default_filename": "index.html"}),
    ])

def check_for_messages(mail, read_messages):
    # create crappy generator TODO
    unread_keys = (k for k in mail.keys() if k not in read_messages)

    for k in unread_keys:
        message = mail.get_message(k)

        read_messages.add(k)

    tornado.ioloop.IOLoop.current().call_later(1, check_for_messages, mail, read_messages)

def delete_old_messages(mail):
    unread_keys = (k for k in mail.keys())

    for k in mail.keys():
        message = mail.get_message(k)
        posix_timestamp = email.utils.mktime_tz(email.utils.parsedate_tz(message['date']))
        date = datetime.datetime.fromtimestamp(posix_timestamp)

        if date < (datetime.datetime.today() - MESSAGE_EXPIRY_TIME):
            mail.remove(k)

        read_messages.remove(k)

    # call myself with a timer for 1 hour, since we don't need to run that often
    tornado.ioloop.IOLoop.current().call_later(3600, delete_old_messages, mail)

def is_not_spam(message):
    # rudimentary spam filtering -- reject if it's not from a list of good addressses
    return re.search(r"@(mit|gmail|yahoo|hotmail|outlook)\.(edu|com)", message['from'])

# extra is a list of additional JSON to be sent
def send_messages(websocket, messages, extra=None):
    #messages_data = [message_to_dict(m) for m in messages]
    messages_data = {k: message_to_dict(v) for k, v in messages.items() if is_not_spam(v)}

    to_send = {'messages': messages_data}
    if extra:
        to_send.update(extra)

    websocket.write_message(to_send)

# rejects messages that seem to be spam
def message_to_dict(message):
    return {
        'subject': message['subject'],
        'from': message['from'],
        'date': email.utils.mktime_tz(email.utils.parsedate_tz(message['date'])) * 1000,    # js expects in ms
        'body': parse_body(message),
    }

if __name__ == "__main__":
    app = make_app()
    app.listen(PORT)

    print('Tornado spinning on {}'.format(PORT))

    # set up mail
    mail = mailbox.Maildir(MAILBOX_PATH)
    read_messages = set()
    tornado.ioloop.IOLoop.current().call_later(1, check_for_messages, mail, read_messages)
    tornado.ioloop.IOLoop.current().call_later(1, delete_old_messages, mail)

    tornado.ioloop.IOLoop.current().start()
