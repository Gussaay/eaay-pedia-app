import { Route, Routes, useNavigate } from 'react-router-dom';
import { ArrowUpCircle, BellRing, BookPlus, Eye, FolderTree, Layers, PencilLine, Users } from 'lucide-react';
import { AppBar, Page } from '../../components/ui';
import { Categories, CategoryBooks, BookQuizzes } from './AdminCatalog';
import { QuizEditor, QuestionEditorPage } from './AdminQuiz';
import { Previews, Chapters, ChapterEditor } from './AdminMisc';
import { FlashDecks, FlashDeckCards } from './AdminFlashcards';
import AdminUpdates from './AdminUpdates';
import AdminUsers from './AdminUsers';
import AdminNotify from './AdminNotify';

function AdminHome() {
  const navigate = useNavigate();
  const items = [
    { icon: BookPlus, title: 'Add content', desc: 'Categories → books → quizzes → questions', to: '/admin/categories' },
    { icon: PencilLine, title: 'Edit quizzes', desc: 'Edit published quizzes and their questions', to: '/cat/*?mode=edit&title=Edit%20quizzes' },
    { icon: Eye, title: 'Preview quizzes', desc: 'Quizzes saved in preview (not published)', to: '/admin/previews' },
    { icon: FolderTree, title: 'Chapters / systems', desc: 'Edit chapters used by "By system" quizzes', to: '/admin/chapters' },
    { icon: Layers, title: 'Flashcard decks', desc: 'Decks and cards, by hand or from a spreadsheet', to: '/admin/flashcards' },
    { icon: ArrowUpCircle, title: 'Update manager', desc: 'Roll out, pause or roll back app updates', to: '/admin/updates' },
    { icon: Users, title: 'User manager', desc: 'Accounts, activity, admin access and blocking', to: '/admin/users' },
    { icon: BellRing, title: 'Notification manager', desc: 'Announcements and push notifications', to: '/admin/notifications' },
  ];
  return (
    <div className="min-h-screen">
      <AppBar title="Admin panel" />
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
      <Route path="flashcards" element={<FlashDecks />} />
      <Route path="flashcards/:deckId" element={<FlashDeckCards />} />
      <Route path="updates" element={<AdminUpdates />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="notifications" element={<AdminNotify />} />
    </Routes>
  );
}
