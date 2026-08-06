'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createSchool, updateSchool } from '@/entities/school/api/SchoolApi';
import { schoolQueryKeys } from '@/entities/school/api/SchoolQueries';
import type { CreateSchoolPayload, UpdateSchoolPayload } from '@/entities/school/model/School';

export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSchoolPayload) => createSchool(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolQueryKeys.lists(),
      });
    },
  });
}

export function useUpdateSchool(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateSchoolPayload) => updateSchool(schoolId, payload),
    onSuccess: async (school) => {
      queryClient.setQueryData(schoolQueryKeys.detail(schoolId), school);
      await queryClient.invalidateQueries({
        queryKey: schoolQueryKeys.lists(),
      });
    },
  });
}
