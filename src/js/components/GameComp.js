const React = require('react');
const PropTypes = require('prop-types');
const { TURNS } = require('../model/flags.js');
const { CellCont } = require('../containers/CellCont.js');
const { WildCardCont } = require('../containers/WildCardCont.js');
const { GameEndCont } = require('../containers/GameEndCont.js');
const { ScoreCont } = require('../containers/ScoreCont.js');
const { SocialsCont } = require('../containers/SocialsCont.js');
const { InfoComp } = require('./InfoComp.js');

/**
 * Functional {@link https://reactjs.org/docs/react-component.html|Component}
 * that renders a {@link Game}.
 *
 * @param {object} props
 * @param {function} props.reset Function to reset a {@link Game}.
 * @param {array} props.board 2 dimensional array of numbers representing the
 * values of {@link Cell|Cells} in a {@link Board}.
 */
const GameComp = ({
    reset,
    board
}) => {
    const handleResetClick = () => {
        const password = prompt("Enter password to restart the game:");
        if (password === "74123") {
            reset();
        } else if (password !== null) {
            alert("Incorrect password!");
        }
    };

    let modalId = "game-info";
    let modalIdHash = "#" + modalId;
    let boardSize = board.length;
    let cells = board.map((row, rowIndex) => {
        let style = ['board-row'];

        if(rowIndex === boardSize - 1) {
            style.push('last-board-row');
        }

        style = style.join(' ');

        return (
            <div className={style}>
                {
                    row.map((col, colIndex) => <CellCont
                        rowIndex = { rowIndex }
                        colIndex = { colIndex }
                        value = { col } />)
                }
            </div>
        );
    });

    return (
        <div className="game-root">
            <div className="container game-section">
                <div className="top-bar row d-flex justify-content-center">

                    <div className="top-control d-flex">
                        <img className="mt-auto" src="./images/restart.png" onClick={handleResetClick} />
                    </div>

                    <div className="left-curve"/>
                    <div className="left-score-box d-flex">
                        <ScoreCont playerName={TURNS.PLAYER1}/>
                    </div>
                    <div className="right-curve"/>

                    <div className="top-center">
                        <div className="top-logo">
                            <h1 className="logo-text">Ticker Tyc🪙🪙n</h1>
                        </div>
                    </div>

                    <div className="left-curve"/>
                    <div className="right-score-box d-flex">
                        <ScoreCont playerName={TURNS.PLAYER2}/>
                    </div>
                    <div className="right-curve"/>

                    <div className="top-control d-flex">
                        <img className="mt-auto" src="./images/info.png" data-toggle="modal" data-target={modalIdHash}/>
                    </div>

                </div>
            </div>
            <div className="container game-section">
                <div className='board'>
                    <WildCardCont />
                    { cells }
                    <GameEndCont boardSize={boardSize}/>
                </div>
            </div>
            <InfoComp id={modalId} style=""/>
            <div className='game-splash'>
                <h1 className="splash-logo-text">Ticker Tyc🪙🪙n</h1>
            </div>
        </div>
    );
};

GameComp.propTypes = {
    reset: PropTypes.func.isRequired,
    board: PropTypes.array.isRequired
};

module.exports = {
    GameComp
};