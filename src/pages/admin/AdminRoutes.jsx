import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ArrowUpCircle, BellRing, BookPlus, Eye, FolderTree, Layers, Lightbulb, PencilLine, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { AppBar, Page } from '../../components/ui';
import { Categories, CategoryBooks, BookQuizzes } from './AdminCatalog';
import { QuizEditor, QuestionEditorPage } from './AdminQuiz';
import { Previews, Chapters, ChapterEditor } from './AdminMisc';
import {
  FlashCategories,
  FlashCategoryBooks,
  FlashBookDecks,
  FlashDeckCards,
} from './AdminFlashcards';
import { MnemonicAdminEdit, MnemonicAdminHome, MnemonicAdminPaper } from './AdminMnemonics';
import AdminUpdates from './AdminUpdates';
import AdminUsers from './AdminUsers';
import AdminNotify from './AdminNotify';

/** Users, roles, access, updates and pushes: managers only, not editors. */
function ManagerOnly({ children }) {
  const { isManager } = useAuth();
  return isManager ? children : <Navigate to="/admin" replace />;
}

function AdminHome() {
  const navigate = useNavigate();
  const { isManager, role } = useAuth();
  const items = [
    { icon: BookPlus, title: 'Add content', desc: 'Categories → books → quizzes → questions', to: '/admin/categories' },
    { icon: PencilLine, title: 'Edit quizzes', desc: 'Edit published quizzes and their questions', to: '/cat/*?mode=edit&title=Edit%20quizzes' },
    { icon: Eye, title: 'Preview quizzes', desc: 'Quizzes saved in preview (not published)', to: '/admin/previews' },
    { icon: FolderTree, title: 'Chapters / systems', desc: 'Edit chapters used by "By system" quizzes', to: '/admin/chapters' },
    { icon: Layers, title: 'Flashcards', desc: 'Categories → books → decks → cards', to: '/admin/flashcards' },
    { icon: Lightbulb, title: 'Mnemonics', desc: 'Exams → papers → chapters, illustrations and flashcard links', to: '/admin/mnemonics' },
    { icon: ArrowUpCircle, title: 'Update manager', desc: 'Roll out, pause or roll back app updates', to: '/admin/updates', manager: true },
    { icon: Users, title: 'Users & access', desc: 'Unlock requests, roles, trials, Pro, locking settings and accounts', to: '/admin/users', manager: true },
    { icon: BellRing, title: 'Notification manager', desc: 'Announcements and push notifications', to: '/admin/notifications', manager: true },
  ].filter((i) => isManager || !i.manager);
  return (
    <div className="min-h-screen">
      <AppBar title="Admin panel" subtitle={role === 'superuser' ? 'Superuser' : role === 'manager' ? 'Manager' : 'Editor'} />
      <Page className="grid sm:grid-cols-2 gap-3">
        {items.map(({ icon: Icon, title, desc, to }) => (
          <button
            key={title}
            onClick={() => navigate(to)}
            className="text-left bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md"
          >
            <Icon className="text-brand-600" size={28} />
            <p className="font-display text-lg mt-2">{title}</p>
            <p className="text-sm text-slate-500">{desc}</p>
          </button>
        ))}
      </Page>
    </div>
  );
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminHome />} />
      <Route path="categories" element={<Categories />} />
      <Route path="category/:source" element={<CategoryBooks />} />
      <Route path="book/:source" element={<BookQuizzes />} />
      <Route path="quiz/:childKey" element={<QuizEditor />} />
      <Route path="quiz/:childKey/question/:qid" element={<QuestionEditorPage />} />
      <Route path="previews" element={<Previews />} />
      <Route path="chapters" element={<Chapters />} />
      <Route path="chapter/:key" element={<ChapterEditor />} />
      <Route path="flashcards" element={<FlashCategories />} />
      <Route path="flashcards/category/:source" element={<FlashCategoryBooks />} />
      <Route path="flashcards/book/:source" element={<FlashBookDecks />} />
      <Route path="flashcards/deck/:deckId" element={<FlashDeckCards />} />
      <Route path="mnemonics" element={<MnemonicAdminHome />} />
      <Route path="mnemonics/paper/:source" element={<MnemonicAdminPaper />} />
      <Route path="mnemonics/edit" element={<MnemonicAdminEdit />} />
      <Route path="updates" element={<ManagerOnly><AdminUpdates /></ManagerOnly>} />
      <Route path="users" element={<ManagerOnly><AdminUsers /></ManagerOnly>} />
      <Route path="access" element={<Navigate to="/admin/users?tab=requests" replace />} />
      <Route path="notifications" element={<ManagerOnly><AdminNotify /></ManagerOnly>} />
    </Routes>
  );
}
