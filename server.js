const WebSocket = require('ws');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');

console.log("Attemtping to reach MYSQL")
const connection = mysql.createConnection({
  host     : '192.168.1.67',
  user     : 'npm',
  password : 'npmnpm',
  database : 'biomass_database'
});
connection.connect();
console.log("Successfully connected to database")

const websocketMap = new Map();

const wss = new WebSocket.Server({ port: 8080 });

const queryReportsByName = `
SELECT report.* from report
inner join researcher on report.FK_Researcher = researcher.ID
where researcher.username = 'JohnDoe'
`

wss.on('connection', function incoming(ws) {
	
	console.log("New connection")
	
	ws.on('message', function incoming(message) {
		console.log('received: %s', message);
		message = JSON.parse(message);
		console.log('Message type : %s',message.type)

		switch(message.type){

			case 'HELLO':
				const uuid = uuidv4().toString()
				ws.id = uuid
				
				console.log("Received hello from %s. Stored ws in map as %s",message['username'],uuid)
				websocketMap.set(uuid,{
					"username":message['username']
				})

				console.log("Current WS map : ")
				websocketMap.forEach((v,k) => {
					console.log("%s -> %s",k,JSON.stringify(v))
				})
				
				ws.send(JSON.stringify({
					"result":"OK_HELLO"
				}))
				break

			case 'GET_REPORTS':
				console.log("Received requests for reports from %s",JSON.stringify(websocketMap.get(ws.id)))
				connection.query(queryReportsByName, function (error, results, fields) {
					if (error) throw error;
					console.log("Retrieved from database : " + results)
					
					ws.send(JSON.stringify({
						"result":"OK_REPORTS",
						"reports":results.map(r => ({
							"id":r.id,
							"status":r.status,
							"submission_date":r.submission_date,
							"latitude":r.latitude,
							"longitude":r.longitude,
							"comment":r.comment
						}))
					}))
				})
				break
		}
	});
});


