import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/models.dart';

class SupabaseService {
  static final SupabaseService instance = SupabaseService._internal();
  SupabaseService._internal();
  final _client = Supabase.instance.client;

      // Auth
      Future<void> signUp(String email, String password, String name) async {
          await _client.auth.signUp(
                email: email, 
                      password: password,
                            data: {'display_name': name}, // Saves the name to Supabase Auth
                                );
                                  }

                                    Future<void> signIn(String email, String password) async {
                                        await _client.auth.signInWithPassword(
                                              email: email, 
                                                    password: password,
                                                        );
                                                          }
                                                            
                                                              Future<void> signOut() async {
                                                                  await _client.auth.signOut();
                                                                    }


  // Data fetching stubs
  Future<List<Habit>> getHabits() async => [];
  Future<List<Task>> getTasksForDate(DateTime date) async => [];
  Future<List<Task>> getAllPendingTasks() async => [];
  Future<List<Goal>> getGoals() async => [];
  Future<MoodEntry?> getTodayMood() async => null;
  Future<List<MoodEntry>> getMoodEntries(int days) async => [];
  Future<AppUser?> getProfile(String id) async => AppUser(id: id, email: 'test@test.com', displayName: 'Captain', createdAt: DateTime.now());
  Future<Map<String, bool>> getHabitLogsForRange(DateTime start, DateTime end) async => {};
  Future<List<JournalEntry>> getJournalEntries() async => [];
  Future<Map<String, dynamic>> getInsightData() async => {'habit_logs': [], 'tasks': [], 'mood_entries': []};

  // Social
  Future<List<AppUser>> getFriends() async => [];
  Future<List<FriendActivity>> getFriendActivity() async => [];
  Future<List<Map<String, dynamic>>> getPendingRequests() async => [];
  Future<void> sendFriendRequest(String email) async {}
  Future<void> acceptFriendRequest(String id, String fromId) async {}
  RealtimeChannel subscribeToFriendActivity(Function(dynamic) callback) => _client.channel('activity')..subscribe();

  // Mutations
  Future<void> toggleHabitLog(String habitId, DateTime date, bool completed) async {}
  Future<Task> createTask(Task t) async => t;
  Future<void> updateTask(Task t) async {}
  Future<void> deleteTask(String id) async {}
  Future<void> upsertMood(MoodEntry m) async {}
  Future<void> createHabit(Habit h) async {}
  Future<void> updateHabit(Habit h) async {}
  Future<void> deleteHabit(String id) async {}
  Future<void> createJournalEntry(JournalEntry j) async {}
  Future<void> updateJournalEntry(JournalEntry j) async {}
  Future<void> deleteJournalEntry(String id) async {}
  Future<void> createGoal(Goal g) async {}
  Future<void> updateGoal(Goal g) async {}
  Future<void> deleteGoal(String id) async {}
}

