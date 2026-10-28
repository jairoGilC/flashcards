import { useRoute } from './app/router'
import Home from './screens/Home'
import Review from './screens/Review'
import Settings from './screens/Settings'
import Import from './screens/Import'
import Editor from './screens/Editor'

export default function App() {
  const route = useRoute()
  switch (route.name) {
    case 'review':
      return <Review deckId={route.params.deck} />
    case 'settings':
      return <Settings />
    case 'import':
      return <Import />
    case 'editor':
      return <Editor deckId={route.params.deck} />
    default:
      return <Home />
  }
}
