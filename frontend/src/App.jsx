import { Link, Route, Routes, useParams } from 'react-router-dom'
import Home from './pages/Home'
import Branch from './pages/Branch'
import Group from './pages/Group'
import Run from './pages/Run'

function TopBar() {
  const { branch } = useParams()
  return (
    <div className="topbar">
      <h1>
        <Link to="/" style={{ color: 'inherit' }}>AO Oracle Results</Link>
      </h1>
      {branch && (
        <span className="crumb">
          / <Link to={`/b/${branch}`}>{branch}</Link>
        </span>
      )}
    </div>
  )
}

export default function App() {
  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<><TopBar /><Home /></>} />
        <Route path="/b/:branch" element={<><TopBar /><Branch /></>} />
        <Route path="/b/:branch/g/*" element={<><TopBar /><Group /></>} />
        <Route path="/b/:branch/r/*" element={<><TopBar /><Run /></>} />
      </Routes>
    </div>
  )
}
