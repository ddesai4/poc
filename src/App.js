import React, { useState, useEffect, useRef } from "react";
import { Select, Layout, Table, Row, Col } from "antd";
import "./App.css";

const App = (props) => {
  const { Header, Content, Footer } = Layout;
  const url = "https://api.pro.coinbase.com";
  const { Option } = Select;
  const [instruments, setIntruments] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState("");
  const [askData, setAskData] = useState([]);
  const [bidData, setBidData] = useState([]);
  const [orderBook, setOrderBook] = useState({ bids: {}, asks: {} });
  const ws = useRef(null);
  useEffect(() => {
    /**
     * Initialize the web socket
     */
    ws.current = new WebSocket("wss://ws-feed.pro.coinbase.com");
    /**
     * Fetch all products
     */
    fetch(url + "/products")
      .then((res) => res.json())
      .then((data) => setIntruments(data));
  }, []);

  /**
   * This method is used to build Asks & Bids Data
   * from OrderBook to be displayed in the Table
   * @param {OrderBook} book
   */
  const buildDataFromBook = (book) => {
    let snapshotBidData = [];
    Object.keys(book.bids).forEach(function (key) {
      snapshotBidData.push({
        price: key,
        size: book.bids[key],
        key: key,
      });
    });
    setBidData(snapshotBidData);

    let snapshotAskData = [];
    Object.keys(book.asks).forEach(function (key) {
      snapshotAskData.push({
        price: key,
        size: book.asks[key],
        key: key,
      });
    });
    setAskData(snapshotAskData);
  };

  /**
   * This method is used to create OrderBook from
   * Snapshot Data fetched for a productId
   * @param {SnapshotData} data
   * @returns OrderBook
   */
  const createOrderBook = (data) => {
    const book = { bids: {}, asks: {} };
    for (let i = 0; i < 10; i++) {
      let bid = data.bids[i];
      book.bids[bid[0]] = bid[1];
    }
    for (let i = 0; i < 10; i++) {
      let ask = data.asks[i];
      book.asks[ask[0]] = ask[1];
    }
    return book;
  };

  /**
   * This method is used to create OrderBook from
   * L2Data fetched for a productId
   * @param {L2Data} data
   * @returns OrderBook
   */
  const createUpdatedBook = (data) => {
    let updatedBook = orderBook;
    let changes = data.changes;
    for (let i = 0; i < changes.length; i++) {
      let change = changes[i];
      if (change[0] === "buy") {
        if (parseInt(change[2]) === 0) {
          delete updatedBook.bids[change[1]];
        } else if (Object.keys(updatedBook.bids).length < 10) {
          updatedBook.bids[change[1]] = change[2];
        }
      } else if (change[0] === "sell") {
        if (parseInt(change[2]) === 0) {
          delete updatedBook.asks[change[1]];
        } else if (Object.keys(updatedBook.asks).length < 10) {
          updatedBook.asks[change[1]] = change[2];
        }
      }
    }
    return updatedBook;
  };

  /**
   * This method will send the websocket payload on selecting an instrument
   * @param {*} instrument
   */
  const connectToWebSocket = (instrument) => {
    let msg = {
      type: "subscribe",
      product_ids: [instrument],
      channels: ["level2"],
    };
    let jsonMsg = JSON.stringify(msg);
    try {
      //If websocket is opened send the payload
      if (ws.current.readyState === 1) {
        ws.current.send(jsonMsg);
      }
    } catch (exception) {
      console.error("Error while sending websocket", exception);
    }

    //Handle the response received.
    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "snapshot" && data.product_id === instrument) {
        //This is to handle the initial snapshot data
        const book = createOrderBook(data);
        setOrderBook(book);
        buildDataFromBook(book);
      } else if (data.type === "l2update" && data.product_id === instrument) {
        //This is to handle the subsequent l2udpate data
        const updatedBook = createUpdatedBook(data);
        setOrderBook(updatedBook);
        buildDataFromBook(updatedBook);
      }
    };
    //On websocket error close the existing connection
    ws.current.onerror = (e) => {
      console.error("Websocket Error:", e);
      ws.current.close();
    };
    //If websocket connection is closed, re-try to open a new one.
    ws.current.onclose = (e) => {
      console.log("Websocket connection closed");
      console.log("Reconnecting...");
      ws.current = new WebSocket("wss://ws-feed.pro.coinbase.com");
      setTimeout(function () {
        connectToWebSocket(instrument);
      }, 1000);
    };
  };

  useEffect(() => {
    if (selectedInstrument) {
      connectToWebSocket(selectedInstrument);
    }
  }, [selectedInstrument, orderBook, askData, bidData]);

  const columns = [
    {
      title: "Price",
      dataIndex: "price",
      align: "center",
    },
    {
      title: "Size",
      dataIndex: "size",
      align: "center",
    },
  ];

  /**
   * This method will unsubscribe to the previous selected product and
   * update the state to the new value which will trigger websocket connection
   * for the new product_id
   * @param {selected product_id} value
   */
  const handleSelect = (value) => {
    if (selectedInstrument) {
      let msg = {
        type: "unsubscribe",
        product_ids: [selectedInstrument],
        channels: ["level2"],
      };
      let jsonMsg = JSON.stringify(msg);
      ws.current.send(jsonMsg);
    }

    setOrderBook({ bids: {}, asks: {} });
    setAskData([]);
    setBidData([]);
    setSelectedInstrument(value);
  };

  return (
    <Layout>
      <Header>
        <h1>GSR Order Book</h1>
      </Header>
      <Content style={{ padding: "10px 50px", height: "85vh" }}>
        <Select
          style={{ width: 200 }}
          placeholder="Select Instrument..."
          onSelect={handleSelect}
          autoFocus
          showSearch
        >
          {instruments.map((instrument) => (
            <Option key={instrument.id} value={instrument.id}>
              {instrument.id}
            </Option>
          ))}
        </Select>
        <Row>
          <Col span={12}>
            {" "}
            <Table
              title={() => `Asks : ${selectedInstrument}`}
              style={{ marginTop: 10 }}
              columns={columns}
              dataSource={askData}
              pagination={false}
            />
          </Col>
          <Col span={12}>
            <Table
              title={() => `Bids : ${selectedInstrument}`}
              style={{ marginTop: 10 }}
              columns={columns}
              dataSource={bidData}
              pagination={false}
            />
          </Col>
        </Row>
      </Content>
      <Footer style={{ textAlign: "center" }}>
        GSR ©2021 Created by Desai, Dhaval
      </Footer>
    </Layout>
  );
};

export default App;
