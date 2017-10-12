const WEBSOCKET_URL = 'ws://leafeon.mit.edu:8888/websocket';

class MessageCard extends React.Component {
  constructor() {
    super()

    this.componentDidMount = this.componentDidMount.bind(this);
  }

  componentDidMount() {
    this.interval = setInterval(() => this.forceUpdate(), 1000);
  }

  render() {
    const elapsedSeconds = Math.ceil((Date.now() - this.props.date) / 1000);

    let elapsedTime = '';
    let cardClass = 'card message-card my-2';
    let headerClass = 'card-header';
    
    if (elapsedSeconds < 90) {
      elapsedTime = `${elapsedSeconds} seconds ago`;
      cardClass += ' border-success'
      headerClass += ' bg-success text-white'
    } else if (elapsedSeconds < 600) {
      cardClass += ' border-warning'
      headerClass += ' bg-warning text-white'
      elapsedTime = `${Math.floor(elapsedSeconds / 60)}:${('' + elapsedSeconds % 60).padStart(2, '0')} ago`;
    } else if (elapsedSeconds < 3600) {
      cardClass += ' border-secondary'
      headerClass += ' bg-secondary text-white'
      elapsedTime = moment(this.props.date).fromNow();
    } else {
      elapsedTime = moment(this.props.date).fromNow();
    }

    return (
      <div className="col-md-6 my-2">
        <div className={cardClass}>
          <h4 className={headerClass}>
            {this.props.subject}
              <div className="float-right">
                <small className="ml-5">{elapsedTime}</small>
              </div>
          </h4>
          <div className="card-body">
            {this.props.body && 
              <p className="card-text" style={{whiteSpace: 'pre-line'}}>{this.props.body}</p>
            }
          </div>
        </div>
      </div>
    );
  }
}

class App extends React.Component {
  constructor() {
    super();

    this.render = this.render.bind(this);
    this.componentDidUpdate = this.componentDidUpdate.bind(this);

    // try to open a websocket connection
    this.state = {didConnectOnce: false, messages: new Map()};
    this.notificationSound = new Audio('http://facebook.design/public/sounds/Notification 2.mp3');

    const startWebSocket = () => {
      const websocket = new WebSocket(WEBSOCKET_URL);
      this.websocket = websocket;

      websocket.onopen = () => {
        this.setState({didConnectOnce: true});
        websocket.send('request-all');  // request all messages initially
        setInterval(() => {
          if (websocket.readyState == websocket.OPEN) {
            websocket.send('request-update');
          }
        }, 1000);  // and updates every 1s
      }

      websocket.onclose = () => {
        this.forceUpdate();     // show error banner
        setTimeout(startWebSocket, 5000);
      }

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.messages) {
          const messages = Object.entries(data.messages);
          // TODO HACK
          this.setState({messages: new Map([...this.state.messages, ...messages])});  // merge new messages
          if (data.type === 'response-update' && messages.length) {
            this.notificationSound.play();
          }
        }
      }
    }

      startWebSocket();
  }

  render() {
    const messages = this.state.messages;

    const sortedMessageKeys = Array.from(messages.keys()).sort((a, b) => {
      return messages.get(b).date - messages.get(a).date;
    });

    const messageCardList = sortedMessageKeys.map(key => {
      const message = messages.get(key);
 
      return <MessageCard
          subject={message.subject || 'No subject'}
          body={message.body.trim()}
          from={message.from || 'No from given'}
          date={message.date}
          key={key}
        />
    });

    return (
      <div>
        { this.websocket.readyState != this.websocket.OPEN &&
          (this.state.didConnectOnce ?
            <div className="alert alert-danger m-2" role="alert">
              <h4 className="alert-heading">WebSocket Error</h4>
              Something went wrong while connecting to the server. Reconnecting...
            </div>
          :
            <div className="alert alert-primary m-2" role="alert">
              <strong>Connecting...</strong>
            </div>
          )
        }
        <div id="card-list">
          {messageCardList}
        </div>
      </div>
    );
  }

  componentDidUpdate() {
    // HACK pack messages
    // FIXME this creates a memory leak--we shouldn't be calling this every time
    // our component updates (we shouldn't be calling this repeatedly at all)
    if ((this.state.lastMessageCount || 0) != this.state.messages.size) {
        this.masonry = new Masonry('#card-list');
        this.setState({lastMessageCount: this.state.messages.size});
    }
  }
}

const app = <App />;

ReactDOM.render(
  app,
  document.getElementById('root')
);
