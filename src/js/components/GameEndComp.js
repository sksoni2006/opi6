const React = require('react');
const PropTypes = require('prop-types');

/**
 * Functional {@link https://reactjs.org/docs/react-component.html|Component}
 * that renders an overlay when a {@link Game} ends.
 *
 * @param {object} props
 * @param {string} props.style CSS style.
 * @param {string} props.message Message to be displayed in the overlay.
 */
const GameEndComp = ({
    style,
    message,
    reset
}) => {
    const handleResetClick = () => {
        const password = prompt("Enter password to restart the game:");
        if (password === "74123") {
            reset();
        } else if (password !== null) {
            alert("Incorrect password!");
        }
    };

    return (
        <div className={style}>
            <p className='message'>{message}</p>
            <img src="./images/restart.png"  onClick={handleResetClick}/>
        </div>
    );
};

GameEndComp.propTypes = {
    style: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    reset: PropTypes.func.isRequired
};

module.exports = {
    GameEndComp
};